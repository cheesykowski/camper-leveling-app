#include <Wire.h>
#include <MPU6050.h>
#include <EEPROM.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SH1106.h>

#define OLED_RESET -1
Adafruit_SH1106 display(OLED_RESET);

MPU6050 mpu;

// Zeitsteuerung
unsigned long prevTime = 0;
float dt;

// Winkelwerte
float angleX = 0, angleY = 0, angleZ = 0;
float offsetX = 0, offsetY = 0;

// Fahrzeugdimensionen
const float wheelbase = 345.0; // Radstand in cm
const float trackWidth = 190.0; // Spurbreite in cm

// Filter-Konstanten
const float alpha = 0.02; // Komplementärfilter
const float beta = 0.1;   // Low-Pass-Filter für Ausgabe
float filteredHeightRoll = 0, filteredHeightPitch = 0 , filteredHeightRollPitch = 0;

int stepKeilRoll = 0, stepKeilPitch = 0, stepKeilRollPitch = 0;

// Knopf-Pins
const int buttonPin = 2;
bool resetAngles = false;

const int switchPin = 3;
bool systemOn = false;
bool wasSystemOn = false;

//Display modus
int displayMode = 0;  // 0 = Step, 1 = Height, 2 = Both
unsigned long lastButtonPressTime = 0;
bool buttonHandled = false;


// Mittelwertbildung für Reset
const int avgWindowSize = 100; // Anzahl Messwerte für eine Sekunde (10ms pro Messung)
float sumX = 0, sumY = 0;
int sampleCount = 0;
bool collecting = false;

void setup() {
    Serial.begin(115200);
    Wire.begin();
    mpu.initialize();
    pinMode(buttonPin, INPUT_PULLUP);
    pinMode(switchPin, INPUT_PULLUP);

    if (!mpu.testConnection()) {
        Serial.println("MPU6050 Verbindung fehlgeschlagen!");
        while (1);
    }
    Serial.println("MPU6050 erfolgreich verbunden");

    // Offset-Werte aus dem EEPROM laden
    EEPROM.get(0, offsetX);
    EEPROM.get(sizeof(float), offsetY);
    Serial.print("Geladene Offsets - Roll: ");
    Serial.print(offsetX);
    Serial.print(" | Pitch: ");
    Serial.println(offsetY);

    // OLED-Display initialisieren
    display.begin(SH1106_I2C_ADDRESS, 0x3C);

    // Display & MPU shutdown if switch is OFF at startup
if (digitalRead(switchPin) == HIGH) { // Switch is OFF
    display.clearDisplay();
    display.display();
    display.SH1106_command(SH1106_DISPLAYOFF);
    mpu.setSleepEnabled(true);
    wasSystemOn = false;
}

}

void loop() {
systemOn = digitalRead(switchPin) == LOW; // Switch ON = LOW if using INPUT_PULLUP

if (!systemOn) {
    // System OFF → shut down display and MPU
    if (wasSystemOn) {
        display.clearDisplay();
        display.display();
        display.SH1106_command(SH1106_DISPLAYOFF); // Turn off display
        mpu.setSleepEnabled(true); // Put MPU in sleep mode
        wasSystemOn = false;
    }
    delay(100); // Save power
    return;
} else {
    if (!wasSystemOn) {
        // Just turned ON → re-enable display + MPU + show welcome screen
        display.SH1106_command(SH1106_DISPLAYON);
        mpu.setSleepEnabled(false);
        delay(100); // Small buffer

        // 💡 Show welcome screen
        display.clearDisplay();
        display.drawLine(20, 50, 108, 30, WHITE); // Auffahrkeil
        display.drawLine(20, 50, 20, 55, WHITE);
        display.drawLine(108, 30, 108, 35, WHITE);
        display.drawLine(20, 55, 108, 35, WHITE);

        const char* text = "KEILOMAT";
        int startX = 19;
        int startY = 30;
        int stepX = 12;
        int stepY = -3;

        display.setTextSize(2);
        display.setTextColor(WHITE);
        for (int i = 0; text[i] != '\0'; i++) {
            display.setCursor(startX + i * stepX, startY + i * stepY);
            display.write(text[i]);
        }

        display.display();
        delay(2000); // Show for 2 seconds

        wasSystemOn = true;
    }
}

    // Display settings
    display.clearDisplay();
    display.setTextSize(1); // Normale Schriftgröße
    display.setTextColor(WHITE);



    int16_t ax, ay, az, gx, gy, gz;
    mpu.getMotion6(&ax, &ay, &az, &gx, &gy, &gz);

    // Zeitdifferenz berechnen
    unsigned long currentTime = millis();
    dt = (currentTime - prevTime) / 1000.0;
    prevTime = currentTime;

    // Anpassung der Achsen aufgrund der 90°-Drehung um die Pitch-Achse
    float accelX = ay / 16384.0;
    float accelY = -ax / 16384.0;
    float accelZ = az / 16384.0;

    float gyroX = gy / 131.0;
    float gyroY = -gx / 131.0;
    float gyroZ = gz / 131.0;

    // Winkel aus Beschleunigungssensor (Roll und Pitch)
    float accAngleX = atan2(accelY, accelZ) * 180 / PI;
    float accAngleY = atan2(-accelX, sqrt(accelY * accelY + accelZ * accelZ)) * 180 / PI;

    // Komplementärfilter für die Winkelberechnung
    angleX = alpha * (angleX + gyroX * dt) + (1 - alpha) * accAngleX;
    angleY = alpha * (angleY + gyroY * dt) + (1 - alpha) * accAngleY;

    // Höhenunterschied berechnen (Roll: Vorder- zu Hinterachse, Pitch: Links zu Rechts)
    float heightRoll = tan((angleX - offsetX) * PI / 180.0) * (wheelbase / 2);
    float heightPitch = tan((angleY - offsetY) * PI / 180.0) * (trackWidth / 2);

    // Low-Pass-Filter für eine geglättete Anzeige
    filteredHeightRoll = beta * heightRoll + (1 - beta) * filteredHeightRoll;
    filteredHeightPitch = beta * heightPitch + (1 - beta) * filteredHeightPitch;
    filteredHeightRollPitch = abs(filteredHeightRoll) + abs(filteredHeightPitch);

    //Auffahrhöhen auf Keil berechnen
    if (abs(filteredHeightRoll) >= 0 && abs(filteredHeightRoll) < 3) {
        stepKeilRoll = 0;
    }
    else if (abs(filteredHeightRoll) >= 3 && abs(filteredHeightRoll) < 6) {
        stepKeilRoll = 1;
    }
    else if (abs(filteredHeightRoll) >= 6 && abs(filteredHeightRoll) < 9) {
        stepKeilRoll = 2;
    }
    else {
        stepKeilRoll = 3;
    }


    if (abs(filteredHeightPitch) >= 0 && abs(filteredHeightPitch) < 3) {
        stepKeilPitch = 0;
    }
    else if (abs(filteredHeightPitch) >= 3 && abs(filteredHeightPitch) < 6) {
        stepKeilPitch = 1;
    }
    else if (abs(filteredHeightPitch) >= 6 && abs(filteredHeightPitch) < 9) {
        stepKeilPitch = 2;
    }
    else {
        stepKeilPitch = 3;
    }



    if (abs(filteredHeightRollPitch) >= 0 && abs(filteredHeightRollPitch) < 3) {
        stepKeilRollPitch = 0;
    }
    else if (abs(filteredHeightRollPitch) >= 3 && abs(filteredHeightRollPitch) < 6) {
        stepKeilRollPitch = 1;
    }
    else if (abs(filteredHeightRollPitch) >= 6 && abs(filteredHeightRollPitch) < 9) {
        stepKeilRollPitch = 2;
    }
    else {
        stepKeilRollPitch = 3;
    }



    // Mittelwert sammeln

        sumX += angleX;
        sumY += angleY;
        sampleCount++;

    if (sampleCount >= avgWindowSize) {
        sumX /= sampleCount;
        sumY /= sampleCount;
        sampleCount = 0;
    }

//Button auslesen
if (digitalRead(buttonPin) == LOW) {
    unsigned long pressStart = millis();

    while (digitalRead(buttonPin) == LOW) {
        if ((millis() - pressStart) >= 4000) {
            // --- Long press → reset offsets ---
            offsetX = sumX / sampleCount;
            offsetY = sumY / sampleCount;
            EEPROM.put(0, offsetX);
            EEPROM.put(sizeof(float), offsetY);
            Serial.println("Offsets gespeichert!");
            sumX = 0;
            sumY = 0;
            sampleCount = 0;

            // Show confirmation message
            display.clearDisplay();
            display.setTextSize(2);
            display.setTextColor(WHITE);
            display.setCursor(40, 15);
            display.println("RESET");
            display.setTextSize(1);
            display.setCursor(32, 35);
            display.println("Nullreferenz");
            display.setCursor(35, 45);
            display.println("gespeichert");
            display.display();
            delay(5000);
            buttonHandled = true;
            break;
        }
        delay(10); // debounce
    }

    if (!buttonHandled && (millis() - pressStart) < 4000) {
        // --- Short press → cycle mode ---
        displayMode = (displayMode + 1) % 3;
        Serial.print("Modus gewechselt: ");
        Serial.println(displayMode);
        delay(500);  // debounce
    }
    buttonHandled = false;
}

  // OLED-Display aktualisieren
display.clearDisplay();
display.setCursor(0, 0);

// Fahrzeugvisualisierung (Transporter von oben)
display.drawRect(45, 10, 30, 45, WHITE);  // Rechteck für das Fahrzeug

// Anzeige der Blöcke für Höhenunterschiede
// vorne rechts
if (filteredHeightRoll > 0 && filteredHeightPitch < 0) {
    display.fillRect(65, 10, 10, 15, WHITE);  // vorne rechts Block

    // Anzeige je nach Modus
    if (displayMode == 1 || displayMode == 2) {
        display.setCursor(80, 15);
        display.print((abs(filteredHeightRoll)+abs(filteredHeightPitch)), 1);  // Gesamtwert
    }
    if (displayMode == 0 || displayMode == 2) {
        display.setCursor(68, 0);
        display.print(stepKeilRollPitch);  // Keilanzahl
    }

    // Roll ist dominant
    if (abs(filteredHeightRoll) > abs(filteredHeightPitch)) {
        display.fillRect(45, 10, 10, 15, WHITE);  // vorne links
        if (displayMode == 1 || displayMode == 2) {
            display.setCursor(20, 15);
            display.print(abs(filteredHeightRoll), 1);  // Einzelwert Roll
        }
        if (displayMode == 0 || displayMode == 2) {
            display.setCursor(48, 0);
            display.print(stepKeilRoll);  // Keilanzahl Roll
        }
    }
    // Pitch ist dominant
    else {
        display.fillRect(65, 40, 10, 15, WHITE);  // hinten rechts
        if (displayMode == 1 || displayMode == 2) {
            display.setCursor(80, 43);
            display.print(abs(filteredHeightPitch), 1);  // Einzelwert Pitch
        }
        if (displayMode == 0 || displayMode == 2) {
            display.setCursor(68, 57);
            display.print(stepKeilPitch);  // Keilanzahl Pitch
        }
    }
}

// hinten rechts
if (filteredHeightRoll < 0 && filteredHeightPitch < 0) {
    display.fillRect(65, 40, 10, 15, WHITE);  // hinten rechts Block

    // Anzeige je nach Modus
    if (displayMode == 1 || displayMode == 2) {
        display.setCursor(80, 43);
        display.print(abs(filteredHeightRoll)+abs(filteredHeightPitch), 1);  // Gesamtwert
    }
    if (displayMode == 0 || displayMode == 2) {
        display.setCursor(68, 57);
        display.print(stepKeilRollPitch);  // Keilanzahl
    }

    // Roll ist dominant
    if (abs(filteredHeightRoll) > abs(filteredHeightPitch)) {
        display.fillRect(45, 40, 10, 15, WHITE);  // hinten links
        if (displayMode == 1 || displayMode == 2) {
            display.setCursor(20, 43);
            display.print(abs(filteredHeightRoll), 1);  // Einzelwert Roll
        }
        if (displayMode == 0 || displayMode == 2) {
            display.setCursor(48, 57);
            display.print(stepKeilRoll);  // Keilanzahl Roll
        }
    }
    // Pitch ist dominant
    else {
        display.fillRect(65, 10, 10, 15, WHITE);  // vorne rechts
        if (displayMode == 1 || displayMode == 2) {
            display.setCursor(80, 15);
            display.print(abs(filteredHeightPitch), 1);  // Einzelwert Pitch
        }
        if (displayMode == 0 || displayMode == 2) {
            display.setCursor(68, 0);
            display.print(stepKeilPitch);  // Keilanzahl Pitch
        }
    }
}

// vorne links
if (filteredHeightRoll > 0 && filteredHeightPitch > 0) {
    display.fillRect(45, 10, 10, 15, WHITE);  // vorne links Block

    // Anzeige je nach Modus
    if (displayMode == 1 || displayMode == 2) {
        display.setCursor(20, 15);
        display.print(abs(filteredHeightRoll)+abs(filteredHeightPitch), 1);  // Gesamtwert
    }
    if (displayMode == 0 || displayMode == 2) {
        display.setCursor(48, 0);
        display.print(stepKeilRollPitch);  // Keilanzahl
    }

    // Roll ist dominant
    if (abs(filteredHeightRoll) > abs(filteredHeightPitch)) {
        display.fillRect(65, 10, 10, 15, WHITE);  // vorne rechts
        if (displayMode == 1 || displayMode == 2) {
            display.setCursor(80, 15);
            display.print(abs(filteredHeightRoll), 1);  // Einzelwert Roll
        }
        if (displayMode == 0 || displayMode == 2) {
            display.setCursor(68, 0);
            display.print(stepKeilRoll);  // Keilanzahl Roll
        }
    }
    // Pitch ist dominant
    else {
        display.fillRect(45, 40, 10, 15, WHITE);  // hinten links
        if (displayMode == 1 || displayMode == 2) {
            display.setCursor(20, 43);
            display.print(abs(filteredHeightPitch), 1);  // Einzelwert Pitch
        }
        if (displayMode == 0 || displayMode == 2) {
            display.setCursor(48, 57);
            display.print(stepKeilPitch);  // Keilanzahl Pitch
        }
    }
}

// hinten links
if (filteredHeightRoll < 0 && filteredHeightPitch > 0) {
    display.fillRect(45, 40, 10, 15, WHITE);  // hinten links Block

    // Anzeige je nach Modus
    if (displayMode == 1 || displayMode == 2) {
        display.setCursor(20, 43);
        display.print(abs(filteredHeightRoll)+abs(filteredHeightPitch), 1);  // Gesamtwert
    }
    if (displayMode == 0 || displayMode == 2) {
        display.setCursor(48, 57);
        display.print(stepKeilRollPitch);  // Keilanzahl
    }

    // Roll ist dominant
    if (abs(filteredHeightRoll) > abs(filteredHeightPitch)) {
        display.fillRect(65, 40, 10, 15, WHITE);  // hinten rechts
        if (displayMode == 1 || displayMode == 2) {
            display.setCursor(80, 43);
            display.print(abs(filteredHeightRoll), 1);  // Einzelwert Roll
        }
        if (displayMode == 0 || displayMode == 2) {
            display.setCursor(68, 57);
            display.print(stepKeilRoll);  // Keilanzahl Roll
        }
    }
    // Pitch ist dominant
    else {
        display.fillRect(45, 10, 10, 15, WHITE);  // vorne links
        if (displayMode == 1 || displayMode == 2) {
            display.setCursor(20, 15);
            display.print(abs(filteredHeightPitch), 1);  // Einzelwert Pitch
        }
        if (displayMode == 0 || displayMode == 2) {
            display.setCursor(48, 0);
            display.print(stepKeilPitch);  // Keilanzahl Pitch
        }
    }
}

// Warnsymbol bei extremer Schieflage
if ((abs(filteredHeightRoll)+abs(filteredHeightPitch)) > 14) {
    display.setCursor(58, 29);
    display.print("!");  // Warnung
}




display.display();


  delay(10);
}
