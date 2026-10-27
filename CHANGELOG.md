# Changelog

## [0.4.1] - 2026-10-27

- Fixed the After Landing checklist validating takeoff anti-ice instead of landing anti-ice - the anti-ice checks now reference the correct landing store path
- Checklist responses for feet minimums (e.g. BARO/DH) now expand to "#3 feet set" / "#4 feet set" automatically instead of requiring them to be listed explicitly
- Oxygen test flow steps during preflight now only run when the preflight option is set to "full"
- Adjusted the FO walkaround timing window so the FO stays silent slightly longer while outside

## [0.4.0] - 2026-10-27

- Voice commands did nothing and the microphone list only showed "Default" when Windows had the English (UK) or another non-US English speech pack, with "The language for the grammar does not match the language of the speech recognizer." in the log - any English speech pack now works - @marxio09dio
- Added approach deviation callouts between 1,000 ft and 50 ft on the approach: "sink rate" and "bank" at the FCOM limits, re-armed at most every 5 s. They can be switched off in Settings
- Added rejected takeoff callouts, triggered by "stop" (or "abort takeoff") on the ground above 40 kt: "spoilers" then "reverse thrust", with "no spoilers" / "no reverse" after 3 s each; no decel call on a reject
- Added an "autobrake disarm" callout on the landing and on a reject: it is said once when the brakes are stamped while the ABS indication is on
- On the landing roll each call (spoilers, reverse) now comes a moment after the FO sees the indication, instead of on the same frame; a late indication is never called missing
- The FO now warns "three minutes not passed yet" in real time if the parking brake is set and the taxi light is off before the post-landing cooldown expires
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
