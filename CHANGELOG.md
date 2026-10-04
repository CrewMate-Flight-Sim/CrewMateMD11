# Changelog

## Unreleased

- Added a passing level callout when setting standard in the climb: "standard crosschecked, passing flight level ___", then "now" as the level is reached - @marxio09dio
- Added GSX pushback: after calling the ground engineer, "we are ready for pushback" starts the GSX departure service - @marxio09dio
- Added "you have control" / "i have control" handover callouts - @marxio09dio
- The FO repeated "are you sure" every two seconds on a wrong After Takeoff item (gear, spoilers, autobrake, flaps), even with "Hold checklist on incorrect item" off - it is now said once, and the checklist only waits for the switch when Hold is on - @marxio09dio
- A missed approach altitude with hundreds (e.g. 3500) was read back as "three thousand feet set" - the FO now reads it in full, or "missed approach set" when the voice pack can't say the value - @marxio09dio
- With TFDI's scroll acceleration on, the FO's heading, speed and altitude knob turns overshot and hunted back and forth (e.g. 269 to 271) before settling - the FO now lands on the value directly - @marxio09dio
- Added Push-to-talk and a Mic On/Off button, bindable to a key, mouse button, joystick, yoke, throttle or controller button in Settings - @marxio09dio
- Voice commands the FO cannot act on are no longer shown as accepted - @marxio09dio
- A flight started on approach got no spoilers, reverse or decel callouts on landing - they now arm whenever the aircraft is airborne - @marxio09dio
- Screen readers now announce every icon button, dropdown and slider by name, and the Ok buttons have stronger text contrast - @marxio09dio
- The FO no longer answers while outside on the walkaround (T-45 to T-33) - ground engineer calls and the preflight timer still work, and an "FO outside" indicator shows meanwhile - @marxio09dio
- Callouts made of several parts (speeds, altitudes, numbers) had long pauses between the words - they now play as one smooth phrase, and a missing sound file no longer silences the whole callout - @marxio09dio

## [0.3.0] - 2026-05-XX

- Initial release of MD11 version – @alexlenh @marxio09dio
