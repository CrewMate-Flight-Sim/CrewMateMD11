# CrewmateMD11 — User Manual

**CrewmateMD11** is a virtual First Officer companion for the **McDonell Douglas MD11** in Microsoft Flight Simulator. It listens to your voice, responds with audio callouts, runs automated cockpit flows, and guides you through interactive checklists — just like a real crew member.

---

<div style="text-align: center;">
  <img src="../crewmate.png" alt="Crewmate avatar" width="800">
</div>

## Table of Contents

1. [Getting Started](#getting-started)
2. [Tutorial](#tutorial)
3. [Voice Commands](#voice-commands)
4. [Tips & Troubleshooting](#tips--troubleshooting)

---

## Getting Started

### Requirements

- The EN‑US voice package must be installed to use the voice engine.
- To use the trainer app, set your Display Language to EN‑US while training (you can change it back afterward).

### Voice Modes

CrewmateMD11 supports two voice recognition modes:

| Mode                   | How it works                                         |
| ---------------------- | ---------------------------------------------------- |
| **Continuous**         | The microphone is always listening. Speak naturally. |
| **Push-to-Talk (PTT)** | Not implemented yet.                                 |

### Volume & Voice Sensitivity

- **Sound Volume** — Controls how loud the FO's audio callouts are (0–100).
- **Voice Sensitivity** — Lower settings are more tolerant of variations (may increase false positives); higher settings are stricter.

---

## Tutorial

### Assumptions

This tutorial assumes you are parked at the gate with engines off. You are the Captain and PF (Pilot Flying); CrewMate acts as PM (Pilot Monitoring).

### Typical preflight timeline (example)

- 50 min: Crew arrives at aircraft and FO takes his/her seat.
- 47 min: FO starts his/her cockpit preparation before IRS aligned.
- 45 min: FO goes out for walkaround. CA starts setting up FMS and doing his/her cockpit preparation.
  ![CA cockpit preparation](Images/1%20COCKPIT%20PREPARATION.png)
- 33 min: FO returns from walkaround and starts the 2nd part of the cockpit preparation.
- 25 min: PF briefs the departure.
- 15 min: PF and PM do the Final cockpit preparation procedure.
  ![CA final cockpit preparation](Images/2%20FINAL%20COCKPIT%20PREPARATION.png)
- 10 min: PF calls for the Cockpit Preparation Checklist.
- 1 min: CrewMate closes the cockpit door. PF and PM perform before start flow, after that PF calls for the BEFORE START checklist.
  ![CA before start](Images/3%20BEFORE%20START%20PROCEDURE.png)

### Pushback and Engine Start

- Announce to PM that you are starting engines (e.g., “Starting engine 3). PM only monitors start in this edition of Crewmate.
- As the sequence expected is 3-1-2, you should start engine 2 last because it's used as trigger for after start flow.
  ![CA after start](Images/4%20AFTER%20START%20PROCEDURE.png)
- On hand signal from ground personnel, call for the AFTER START checklist.

### Taxi

- Announce clear left.
- PM announces when the cabin is ready.
- Check flight controls at a convenient time before or during taxi.
- PM will check the main controls, you check the rudder.
- After the controls check, PM performs the TAXI flow.
- After the 2nd TAXI flow is completed is pressed and a cabin report is received, PF calls for the Taxi checklist.
  ![CA taxi](Images/5%20TAXI%20PROCEDURE.png)

### Line‑up & Takeoff

- PF calls for the Line‑up flow.
- When line‑up clearance is received and the Line‑up flow pattern is complete, PF calls for the BEFORE TAKEOFF checklist.
  ![CA before takeoff](Images/6%20BEFORE%20TAKEOFF%20PROCEDURE.png)
- When ready to takeoff, set 70% N1 and call Autoflight.
  ![CA takeoff](Images/7%20TAKEOFF%20PROCEDURE.png)

### Acceleration

- The After‑Takeoff flow is triggered when the aircraft is clean.
- When the aircraft is clean call for the AFTER TAKEOFF checklist to the line.
- When the aircraft is above transition altitude and altimeters are standard call for the AFTER TAKEOFF checklist below the line.
  ![CA after takeoff](Images/8%20AFTER%20TAKEOFF%20PROCEDURE.png)

### Climb to 10,000 ft

### Descent Preparation

- PF should insert landing data in the Landing Plan window.
  ![CA descent preparation](Images/9%20DESCENT%20PREPARATION.png)
- When aircraft is descending FO will set seat belts on and turn on windshield heating.
- Execute Descent/Approach checklist through seat belts.

### 10k Descent

### Approach

- After passing the transition level and/or setting the barometric reference, complete the Descent/Approach checklist.
  ![CA approach](Images/10%20APPROACH.png)

### Landing

- When gear is down, order FO to select an autobrake setting (min/med/max).
- When LDG CONF is set and a cabin report is received, call for the BEFORE LANDING checklist.
  ![CA landing](Images/11%20LANDING.png)
- PF announces “Continue” at minima or “Go‑around” as appropriate.

### After Landing

- Call for clean up when clear of runway to start after landing flow
- If anti‑ice is used, flaps will be retracted to 28/EXT.
- Once flows done call for the AFTER LANDING checklist.
  ![CA after landing](Images/12%20AFTER%20LANDING.png)

### Parking

- Announce "turning into stand", to trigger PM to turn off the lights.
- Taxi lights off and parking brake on will trigger first part of the Parking flow.
- FO will announce that engines are ready to be shutdown after flow completes.
- Shutting down the engines will trigger the second part of the Parking flow.
- After the Parking flow pattern completes, PM calls for the PARKING checklist.
  ![CA parking](Images/13%20PARKING%20PROCEDURE.png)

### Securing the Aircraft

- After the last passenger leaves (if securing the aircraft), call for the Leaving Aircraft checklist.

---

## Voice Commands

Speak these phrases clearly during flight. The FO uses partial matching — you don't need to be word‑perfect, but include the key phrase.

### Preflight Timer

| Say                          | What happens                                                             |
| ---------------------------- | ------------------------------------------------------------------------ |
| "Let's prepare the aircraft" | Starts the preflight countdown timer to help you track preparation time. |

### Ground Engineer

| Say                       | What happens                                |
| ------------------------- | ------------------------------------------- |
| "Ground from cockpit"     | Ground Engineer will ask whats your request |
| "Cockpit to ground"       | Ground Engineer will ask whats your request |
| "Ground from flight deck" | Ground Engineer will ask whats your request |

### Gear

| Say         | What happens                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------- |
| "gear down" | Lowers the landing gear. **Speed must be at or below 260 knots.** **Automatically arms spoilers.** |
| "gear up"   | Raises the landing gear.                                                                           |

### Flaps

The FO will confirm speed limits before moving flaps while airborne.

| Say                          | Flap Setting             | Max Speed |
| ---------------------------- | ------------------------ | --------- |
| "slats retract"              | Flaps UP/RET (retracted) | —         |
| "slats extend" or "flaps up" | Flaps UP/EXT             | 280 kts   |
| "flaps fifteen"              | Flaps DAF-15/EXT         | 255 kts   |
| "flaps twenty eight"         | Flaps 28/EXT             | 210 kts   |
| "flaps thirty five"          | Flaps 35/EXT             | 190 kts   |
| "flaps fifty"                | Flaps 50/EXT             | 175 kts   |

### Engine Anti‑Ice

| Say                   | What happens                               |
| --------------------- | ------------------------------------------ |
| "Engine anti ice on"  | Turns on engine anti‑ice for both engines. |
| "Engine anti ice off" | Turns off engine anti‑ice.                 |

### Airfoil Anti‑Ice

| Say                    | What happens                      |
| ---------------------- | --------------------------------- |
| "Airfoil anti ice on"  | Turns on wing and tail anti‑ice.  |
| "AIrfoil anti ice off" | Turns off wing and tail anti‑ice. |

### Lights (Landing / Taxi / Nose / Strobe)

| Say                 | What happens               |
| ------------------- | -------------------------- |
| "Taxi lights on"    | Turns on nose taxi light.  |
| "Taxi lights off"   | Turns off nose taxi light. |
| "Strobe lights on"  | Turns on strobes.          |
| "Strobe lights off" | Turns off strobes.         |

### Flight Director

| Say                   | What happens                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------- |
| "Flight Director on"  | Activates the Flight Director. (FO only as it's unreachable for FO to turn off captain's)   |
| "Flight Director off" | Deactivates the Flight Director. (FO only as it's unreachable for FO to turn off captain's) |

### Autopilot

| Say                                                                                                | What happens                                         |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| "Autoflight"                                                                                       | Engages Autopilot. Also activates A/THR for takeoff. |
| "Set speed **_ or speed select _**"                                                                | Sets commanded speed.                                |
| "Set heading **\_ or heading select \_\_**"                                                        | Sets commanded heading.                              |
| "Set altitude **\_** or altitude select **\_** or set flight level **_ or flight level select _**" | Sets commanded altitude.                             |
| "Engage selected speed"                                                                            | Pulls speed knob to select selected speed.           |
| "Engage heading select"                                                                            | Pulls heading knob to select selected heading.       |
| "Engage heading hold"                                                                              | Pushes heading knob to activate heading holde mode.  |
| "Engage nav"                                                                                       | Selects NAV mode.                                    |
| "Engage land"                                                                                      | Selects LAND mode.                                   |
| "Engage level change"                                                                              | Pulls altitude knob.                                 |
| "Engage profile"                                                                                   | Selects PROF mode.                                   |

### Flight Controls Check

| Say                     | What happens                                                                      |
| ----------------------- | --------------------------------------------------------------------------------- |
| "Flight controls check" | Starts the flight controls flow: Up, Down, Left, Right, Rudder Left, Rudder Right |

### Launching Flows by Voice

| Say                                            | Flow launched       |
| ---------------------------------------------- | ------------------- |
| "Clear left" or "Left side clear"              | Clear Left flow     |
| "Runway entry procedure" or "Clear to line up" | Before Takeoff flow |
| "Before start procedure"                       | Before Start flow   |
| "Okay to clean up"                             | After Landing flow  |

### Launching Checklists by Voice

| Say                                                         | Checklist launched            |
| ----------------------------------------------------------- | ----------------------------- |
| "Before start checklist to the line"                        | Before start to the line      |
| "Before start checklist below the line"                     | Before start below the line   |
| "After start checklist"                                     | After Start                   |
| "Before takeoff checklist to the line"                      | Before takeoff to the line    |
| "Before takeoff checklist below the line"                   | Before takeoff below the line |
| "After takeoff climb checklist to the line"                 | Climb to the line             |
| "After takeoff climb checklist below the line"              | Climb below the line          |
| "Approach checklist"                                        | Approach                      |
| "Landing checklist"                                         | Landing                       |
| "After landing checklist"                                   | After Landing                 |
| "Parking checklist"                                         | Parking                       |
| "Secure aircraft checklist"                                 | Secure Aircraft               |
| "Stop checklist" or "Abort checklist" or "Cancel checklist" | Aborts the active checklist   |

---

## Tips & Troubleshooting

**The FO isn't hearing me**

- Check that your microphone is selected and working.
- Adjust the **Voice Sensitivity** setting.

**The FO keeps repeating the challenge**

- Your response didn't match the expected phrase. Listen to the challenge and use one of the phrases listed in this manual (voice matching can be tuned in settings).
- If a physical switch must be set first (e.g., parking brake), set it in the cockpit before responding.

**How do I stop a checklist mid‑way?**

- Say **"Stop checklist"**, **"Abort checklist"**, or **"Cancel checklist"** at any time.

**Can I run flows and checklists manually without voice?**

- Yes. Both can be triggered from the **Flows** and **Checklist** panels in the app UI.

---
