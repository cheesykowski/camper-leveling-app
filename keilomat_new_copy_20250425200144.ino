#include <Wire.h>
#include <MPU6050.h>
#include <EEPROM.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SH1106.h>

#define OLED_RESET -1
Adafruit_SH1106 display(OLED_RESET);

MPU6050 mpu;

// Timing
unsigned long prevTime = 0;
float dt;

// Angle readings
float angleX = 0, angleY = 0, angleZ = 0;
float offsetX = 0, offsetY = 0;

// Vehicle dimensions
const float wheelbase = 345.0; // Wheelbase in cm
const float trackWidth = 190.0; // Track width in cm

// Filter constants
const float alpha = 0.02; // Complementary filter
const float beta = 0.1;   // Output low-pass filter
float filteredHeightRoll = 0, filteredHeightPitch = 0 , filteredHeightRollPitch = 0;

int wedgeStepRoll = 0, wedgeStepPitch = 0, wedgeStepCombined = 0;

// Button pins
const int buttonPin = 2;
bool resetAngles = false;

const int switchPin = 3;
bool systemOn = false;
bool wasSystemOn = false;

// Display mode
int displayMode = 0;  // 0 = Step, 1 = Height, 2 = Both
unsigned long lastButtonPressTime = 0;
bool buttonHandled = false;


// Averaging for reset
const int avgWindowSize = 100; // 100 readings at 10 ms intervals
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
        Serial.println("MPU6050 connection failed!");
        while (1);
    }
    Serial.println("MPU6050 connected successfully");

    // Load offsets from EEPROM
    EEPROM.get(0, offsetX);
    EEPROM.get(sizeof(float), offsetY);
    Serial.print("Loaded offsets - Roll: ");
    Serial.print(offsetX);
    Serial.print(" | Pitch: ");
    Serial.println(offsetY);

    // Initialize the OLED display
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
    // System is off: shut down the display and MPU.
    if (wasSystemOn) {
        display.clearDisplay();
        display.display();
        display.SH1106_command(SH1106_DISPLAYOFF); // Turn off display
        mpu.setSleepEnabled(true); // Put MPU in sleep mode
        wasSystemOn = false;
    }
    delay(100); // Save power.
    return;
} else {
    if (!wasSystemOn) {
        // The system was just turned on: enable the display and MPU, then show the welcome screen.
        display.SH1106_command(SH1106_DISPLAYON);
        mpu.setSleepEnabled(false);
        delay(100); // Allow the hardware to settle.

        // Show the welcome screen.
        display.clearDisplay();
        display.drawLine(20, 50, 108, 30, WHITE); // Wedge
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
        delay(2000); // Keep the welcome screen visible for two seconds.

        wasSystemOn = true;
    }
}

    // Configure the display.
    display.clearDisplay();
    display.setTextSize(1); // Normal text size.
    display.setTextColor(WHITE);



    int16_t ax, ay, az, gx, gy, gz;
    mpu.getMotion6(&ax, &ay, &az, &gx, &gy, &gz);

    // Calculate elapsed time.
    unsigned long currentTime = millis();
    dt = (currentTime - prevTime) / 1000.0;
    prevTime = currentTime;

    // Adjust axes for the 90-degree rotation around the pitch axis.
    float accelX = ay / 16384.0;
    float accelY = -ax / 16384.0;
    float accelZ = az / 16384.0;

    float gyroX = gy / 131.0;
    float gyroY = -gx / 131.0;
    float gyroZ = gz / 131.0;

    // Calculate roll and pitch from the accelerometer.
    float accAngleX = atan2(accelY, accelZ) * 180 / PI;
    float accAngleY = atan2(-accelX, sqrt(accelY * accelY + accelZ * accelZ)) * 180 / PI;

    // Apply the complementary filter to calculate the angles.
    angleX = alpha * (angleX + gyroX * dt) + (1 - alpha) * accAngleX;
    angleY = alpha * (angleY + gyroY * dt) + (1 - alpha) * accAngleY;

    // Calculate height differences (roll: front to rear; pitch: left to right).
    float heightRoll = tan((angleX - offsetX) * PI / 180.0) * (wheelbase / 2);
    float heightPitch = tan((angleY - offsetY) * PI / 180.0) * (trackWidth / 2);

    // Apply a low-pass filter to smooth the display.
    filteredHeightRoll = beta * heightRoll + (1 - beta) * filteredHeightRoll;
    filteredHeightPitch = beta * heightPitch + (1 - beta) * filteredHeightPitch;
    filteredHeightRollPitch = abs(filteredHeightRoll) + abs(filteredHeightPitch);

    // Calculate the wedge step for each height.
    if (abs(filteredHeightRoll) >= 0 && abs(filteredHeightRoll) < 3) {
        wedgeStepRoll = 0;
    }
    else if (abs(filteredHeightRoll) >= 3 && abs(filteredHeightRoll) < 6) {
        wedgeStepRoll = 1;
    }
    else if (abs(filteredHeightRoll) >= 6 && abs(filteredHeightRoll) < 9) {
        wedgeStepRoll = 2;
    }
    else {
        wedgeStepRoll = 3;
    }


    if (abs(filteredHeightPitch) >= 0 && abs(filteredHeightPitch) < 3) {
        wedgeStepPitch = 0;
    }
    else if (abs(filteredHeightPitch) >= 3 && abs(filteredHeightPitch) < 6) {
        wedgeStepPitch = 1;
    }
    else if (abs(filteredHeightPitch) >= 6 && abs(filteredHeightPitch) < 9) {
        wedgeStepPitch = 2;
    }
    else {
        wedgeStepPitch = 3;
    }



    if (abs(filteredHeightRollPitch) >= 0 && abs(filteredHeightRollPitch) < 3) {
        wedgeStepCombined = 0;
    }
    else if (abs(filteredHeightRollPitch) >= 3 && abs(filteredHeightRollPitch) < 6) {
        wedgeStepCombined = 1;
    }
    else if (abs(filteredHeightRollPitch) >= 6 && abs(filteredHeightRollPitch) < 9) {
        wedgeStepCombined = 2;
    }
    else {
        wedgeStepCombined = 3;
    }



    // Collect readings for offset averaging.

        sumX += angleX;
        sumY += angleY;
        sampleCount++;

    if (sampleCount >= avgWindowSize) {
        sumX /= sampleCount;
        sumY /= sampleCount;
        sampleCount = 0;
    }

// Read the button state.
if (digitalRead(buttonPin) == LOW) {
    unsigned long pressStart = millis();

    while (digitalRead(buttonPin) == LOW) {
        if ((millis() - pressStart) >= 4000) {
            // A long press resets the offsets.
            offsetX = sumX / sampleCount;
            offsetY = sumY / sampleCount;
            EEPROM.put(0, offsetX);
            EEPROM.put(sizeof(float), offsetY);
            Serial.println("Offsets saved!");
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
            display.println("Zero reference");
            display.setCursor(35, 45);
            display.println("saved");
            display.display();
            delay(5000);
            buttonHandled = true;
            break;
        }
        delay(10); // Debounce.
    }

    if (!buttonHandled && (millis() - pressStart) < 4000) {
        // A short press cycles the display mode.
        displayMode = (displayMode + 1) % 3;
        Serial.print("Display mode changed: ");
        Serial.println(displayMode);
        delay(500);  // Debounce.
    }
    buttonHandled = false;
}

  // Update the OLED display.
display.clearDisplay();
display.setCursor(0, 0);

// Top-down vehicle illustration.
display.drawRect(45, 10, 30, 45, WHITE);  // Vehicle outline.

// Display the blocks representing height differences.
// Front right.
if (filteredHeightRoll > 0 && filteredHeightPitch < 0) {
    display.fillRect(65, 10, 10, 15, WHITE);  // Front-right block.

    // Display values according to the selected mode.
    if (displayMode == 1 || displayMode == 2) {
        display.setCursor(80, 15);
        display.print((abs(filteredHeightRoll)+abs(filteredHeightPitch)), 1);  // Combined value.
    }
    if (displayMode == 0 || displayMode == 2) {
        display.setCursor(68, 0);
        display.print(wedgeStepCombined);  // Wedge step.
    }

    // Roll is dominant.
    if (abs(filteredHeightRoll) > abs(filteredHeightPitch)) {
        display.fillRect(45, 10, 10, 15, WHITE);  // Front left.
        if (displayMode == 1 || displayMode == 2) {
            display.setCursor(20, 15);
            display.print(abs(filteredHeightRoll), 1);  // Roll value.
        }
        if (displayMode == 0 || displayMode == 2) {
            display.setCursor(48, 0);
            display.print(wedgeStepRoll);  // Roll wedge step.
        }
    }
    // Pitch is dominant.
    else {
        display.fillRect(65, 40, 10, 15, WHITE);  // Rear right.
        if (displayMode == 1 || displayMode == 2) {
            display.setCursor(80, 43);
            display.print(abs(filteredHeightPitch), 1);  // Pitch value.
        }
        if (displayMode == 0 || displayMode == 2) {
            display.setCursor(68, 57);
            display.print(wedgeStepPitch);  // Pitch wedge step.
        }
    }
}

// Rear right.
if (filteredHeightRoll < 0 && filteredHeightPitch < 0) {
    display.fillRect(65, 40, 10, 15, WHITE);  // Rear-right block.

    // Display values according to the selected mode.
    if (displayMode == 1 || displayMode == 2) {
        display.setCursor(80, 43);
        display.print(abs(filteredHeightRoll)+abs(filteredHeightPitch), 1);  // Combined value.
    }
    if (displayMode == 0 || displayMode == 2) {
        display.setCursor(68, 57);
        display.print(wedgeStepCombined);  // Wedge step.
    }

    // Roll is dominant.
    if (abs(filteredHeightRoll) > abs(filteredHeightPitch)) {
        display.fillRect(45, 40, 10, 15, WHITE);  // Rear left.
        if (displayMode == 1 || displayMode == 2) {
            display.setCursor(20, 43);
            display.print(abs(filteredHeightRoll), 1);  // Roll value.
        }
        if (displayMode == 0 || displayMode == 2) {
            display.setCursor(48, 57);
            display.print(wedgeStepRoll);  // Roll wedge step.
        }
    }
    // Pitch is dominant.
    else {
        display.fillRect(65, 10, 10, 15, WHITE);  // Front right.
        if (displayMode == 1 || displayMode == 2) {
            display.setCursor(80, 15);
            display.print(abs(filteredHeightPitch), 1);  // Pitch value.
        }
        if (displayMode == 0 || displayMode == 2) {
            display.setCursor(68, 0);
            display.print(wedgeStepPitch);  // Pitch wedge step.
        }
    }
}

// Front left.
if (filteredHeightRoll > 0 && filteredHeightPitch > 0) {
    display.fillRect(45, 10, 10, 15, WHITE);  // Front-left block.

    // Display values according to the selected mode.
    if (displayMode == 1 || displayMode == 2) {
        display.setCursor(20, 15);
        display.print(abs(filteredHeightRoll)+abs(filteredHeightPitch), 1);  // Combined value.
    }
    if (displayMode == 0 || displayMode == 2) {
        display.setCursor(48, 0);
        display.print(wedgeStepCombined);  // Wedge step.
    }

    // Roll is dominant.
    if (abs(filteredHeightRoll) > abs(filteredHeightPitch)) {
        display.fillRect(65, 10, 10, 15, WHITE);  // Front right.
        if (displayMode == 1 || displayMode == 2) {
            display.setCursor(80, 15);
            display.print(abs(filteredHeightRoll), 1);  // Roll value.
        }
        if (displayMode == 0 || displayMode == 2) {
            display.setCursor(68, 0);
            display.print(wedgeStepRoll);  // Roll wedge step.
        }
    }
    // Pitch is dominant.
    else {
        display.fillRect(45, 40, 10, 15, WHITE);  // Rear left.
        if (displayMode == 1 || displayMode == 2) {
            display.setCursor(20, 43);
            display.print(abs(filteredHeightPitch), 1);  // Pitch value.
        }
        if (displayMode == 0 || displayMode == 2) {
            display.setCursor(48, 57);
            display.print(wedgeStepPitch);  // Pitch wedge step.
        }
    }
}

// Rear left.
if (filteredHeightRoll < 0 && filteredHeightPitch > 0) {
    display.fillRect(45, 40, 10, 15, WHITE);  // Rear-left block.

    // Display values according to the selected mode.
    if (displayMode == 1 || displayMode == 2) {
        display.setCursor(20, 43);
        display.print(abs(filteredHeightRoll)+abs(filteredHeightPitch), 1);  // Combined value.
    }
    if (displayMode == 0 || displayMode == 2) {
        display.setCursor(48, 57);
        display.print(wedgeStepCombined);  // Wedge step.
    }

    // Roll is dominant.
    if (abs(filteredHeightRoll) > abs(filteredHeightPitch)) {
        display.fillRect(65, 40, 10, 15, WHITE);  // Rear right.
        if (displayMode == 1 || displayMode == 2) {
            display.setCursor(80, 43);
            display.print(abs(filteredHeightRoll), 1);  // Roll value.
        }
        if (displayMode == 0 || displayMode == 2) {
            display.setCursor(68, 57);
            display.print(wedgeStepRoll);  // Roll wedge step.
        }
    }
    // Pitch is dominant.
    else {
        display.fillRect(45, 10, 10, 15, WHITE);  // Front left.
        if (displayMode == 1 || displayMode == 2) {
            display.setCursor(20, 15);
            display.print(abs(filteredHeightPitch), 1);  // Pitch value.
        }
        if (displayMode == 0 || displayMode == 2) {
            display.setCursor(48, 0);
            display.print(wedgeStepPitch);  // Pitch wedge step.
        }
    }
}

// Show a warning for extreme tilt.
if ((abs(filteredHeightRoll)+abs(filteredHeightPitch)) > 14) {
    display.setCursor(58, 29);
    display.print("!");  // Warning.
}




display.display();


  delay(10);
}
