namespace VoiceSidecar
{
    public record VoiceCommand(string Type, string Raw, Dictionary<string, object> Payload);

    /// Dispatches a recognized grammar result to a structured VoiceCommand.
    public static class CommandDispatcher
    {
        public static VoiceCommand? Dispatch(
            string actionRuleId,
            string cmdId,
            string cmdValue,
            string rawText
        )
        {
            if (!int.TryParse(cmdId, out var pid))
                return null;

            return actionRuleId switch
            {
                "FO_COMMANDS" => DispatchFo(pid, cmdValue, rawText),
                "FMA_CALLOUTS" => DispatchFma(cmdValue, rawText),
                "DISCRETE_COMMANDS" => DispatchDiscrete(pid, rawText),
                _ => null,
            };
        }

        // FO_COMMANDS
        private static VoiceCommand? DispatchFo(int pid, string cval, string raw)
        {
            return pid switch
            {
                1 => Heading(cval, raw),
                2 => FlightLevel(cval, raw),
                3 => AltitudeFeet(cval, raw),
                4 => Speed(cval, raw),
                7 => Altimeter(cval, raw),
                15 => MissedApproachAuto(raw),
                16 => MissedApproachFeet(cval, raw),
                17 => MissedApproachFL(cval, raw),
                18 => Minimums(cval, raw),
                _ => null,
            };
        }

        private static VoiceCommand? Heading(string cval, string raw)
        {
            if (!int.TryParse(cval, out var v) || v < 0 || v > 359)
                return null;
            return Cmd("heading", raw, new() { ["value"] = v });
        }

        private static VoiceCommand? FlightLevel(string cval, string raw)
        {
            if (!int.TryParse(cval, out var fl) || fl < 10 || fl > 450)
                return null;
            return Cmd(
                "altitude",
                raw,
                new()
                {
                    ["value"] = fl * 100,
                    ["unit"] = "feet",
                    ["flightLevel"] = fl,
                }
            );
        }

        private static VoiceCommand? AltitudeFeet(string cval, string raw)
        {
            if (!int.TryParse(cval, out var v) || v < 100 || v > 60000)
                return null;
            return Cmd("altitude", raw, new() { ["value"] = v, ["unit"] = "feet" });
        }

        private static VoiceCommand? Speed(string cval, string raw)
        {
            if (!int.TryParse(cval, out var v) || v < 60 || v > 400)
                return null;
            return Cmd("speed", raw, new() { ["value"] = v, ["unit"] = "knots" });
        }

        private static VoiceCommand? Altimeter(string cval, string raw)
        {
            if (!int.TryParse(cval, out var v))
                return null;

            // inHg
            if (v is >= 2700 and <= 3100)
            {
                return Cmd(
                    "altimeter",
                    raw,
                    new()
                    {
                        ["value"] = Math.Round(v / 100.0, 2),
                        ["unit"] = "inHg",
                        ["raw"] = v,
                    }
                );
            }

            // hPa
            if (v is >= 900 and <= 1100)
                return Cmd(
                    "altimeter",
                    raw,
                    new()
                    {
                        ["value"] = v,
                        ["unit"] = "hPa",
                        ["raw"] = v,
                    }
                );

            return null;
        }
        private static VoiceCommand MissedApproachAuto(string raw) =>
            Cmd("missed_approach_altitude", raw, new() { ["mode"] = "auto" });
        private static VoiceCommand? MissedApproachFeet(string cval, string raw)
        {
            if (!int.TryParse(cval, out var v) || v < 100 || v > 60000)
                return null;
            return Cmd(
                "missed_approach_altitude",
                raw,
                new()
                {
                    ["mode"] = "manual",
                    ["value"] = v,
                    ["unit"] = "feet",
                }
            );
        }

        private static VoiceCommand? MissedApproachFL(string cval, string raw)
        {
            if (!int.TryParse(cval, out var fl) || fl < 10 || fl > 450)
                return null;
            return Cmd(
                "missed_approach_altitude",
                raw,
                new()
                {
                    ["mode"] = "manual",
                    ["value"] = fl * 100,
                    ["unit"] = "feet",
                    ["flightLevel"] = fl,
                }
            );
        }

            private static VoiceCommand? Minimums(string cval, string raw)
            {
                if (!int.TryParse(cval, out var v) || v < 0 || v > 10000)
                    return null;
                return Cmd(
                    "minimums",
                    raw,
                    new()
                    {
                        ["value"] = v,
                        ["unit"] = "feet",
                    }
                );
            }
            private static VoiceCommand DispatchFma(string cval, string raw)
            {
                var payload = new Dictionary<string, object>();

                // pipe: th | thc | lt | ltc | la | vt | vtc | va | ls | pid
                var parts = cval.Split('|');

                void Set(int i, string key)
                {
                    if (parts.Length > i && parts[i].Length > 0)
                        payload[key] = parts[i];
                }

                Set(0, "thrust");
                Set(1, "thrustColor");
                Set(2, "lateral");
                Set(3, "lateralColor");
                Set(4, "lateralArmed");
                Set(5, "vertical");
                Set(6, "verticalColor");
                Set(7, "verticalArmed");
                Set(8, "landStatus");
                Set(9, "configId");

                return Cmd("fma_callout", raw, payload);
            }
        // ─── DISCRETE_COMMANDS ────────────────────────────────────────────────────

        private static readonly Dictionary<int, string> DiscreteNames = new()
        {
        [1] = "gear_up",
        [2] = "gear_down",
        [3] = "slats_ret",
        [4] = "slats_ext_zero",
        [5] = "flaps_15",
        [6] = "flaps_28",
        [7] = "flaps_35",
        [8] = "flaps_50",
        [9] = "go_around_flaps",
        [10] = "turning_into_stand",
        [11] = "autobrake_off",
        [12] = "autobrake_min",
        [13] = "strobe_lights_on",
        [14] = "autobrake_med",
        [15] = "strobe_lights_off",
        [16] = "taxi_lights_on",
        [17] = "taxi_lights_off",
        [18] = "flight_director_on",
        [19] = "flight_director_off",
        [20] = "checklist_parking",
        [21] = "checklist_cockpit_prep",
        [22] = "checklist_before_start",
        [23] = "checklist_after_start",
        [24] = "checklist_taxi",
        [25] = "checklist_before_takeoff",
        [26] = "checklist_after_takeoffP1",
        [27] = "checklist_after_takeoffP2",
        [28] = "checklist_desapprP1",
        [29] = "checklist_before_landing",
        [30] = "checklist_after_landing",
        [31] = "checklist_cancel",
        [32] = "set_and_checked",
        [33] = "prepare_aircraft",
        [34] = "engine_start_1",
        [35] = "engine_start_2",
        [36] = "apu_start",
        [37] = "clear_left",
        [38] = "runway_entry_procedure",
        [39] = "before_start_procedure",
        [40] = "clear_for_takeoff",
        [41] = "abort_takeoff",
        [42] = "continue",
        [43] = "takeoff",
        [44] = "flight_controls_check",
        [45] = "engage_prof",
        [46] = "wipers_int",
        [47] = "seat_belts_auto",
        [48] = "clean_up",
        [49] = "autobrake_max",
        [50] = "foil_anti_ice_on",
        [51] = "foil_anti_ice_off",
        [52] = "engine_anti_ice_on",
        [53] = "engine_anti_ice_off",
        [54] = "wipers_off",
        [55] = "wipers_slow",
        [56] = "wipers_fast",
        [57] = "seat_belts_on",
        [58] = "seat_belts_off",
        [59] = "reviewed",
        [60] = "shutdown_e2",
        [61] = "anti_ice_auto",
        [64] = "set_standard",
        [70] = "completed",
        [71] = "confirm",
        [72] = "negative",
        [73] = "checked",
        [74] = "set",
        [75] = "on",
        [76] = "off",
        [77] = "armed",
        [78] = "disarmed",
        [79] = "on_and_auto",
        [80] = "up_neutral",
        [81] = "standard_set",
        [82] = "normal",
        [83] = "secured",
        [84] = "low",
        [85] = "mid",
        [86] = "max",
        [87] = "0_taxi",
        [88] = "retracted",
        [89] = "down",
        [90] = "removed",
        [91] = "released",
        [92] = "received",
        [93] = "a",
        [94] = "b",
        [95] = "advised",
        [96] = "closed",
        [97] = "check_and_read",

        [98] = "checklist_desapprP2",

        [100] = "autopilot_engage",
        [101] = "autopilot_disconnect",
        [102] = "pull_altitude",
        [103] = "push_heading",
        [104] = "pull_speed",
        [105] = "pull_heading",
        [106] = "manage_nav",
        [107] = "push_to_level_off",
        [108] = "arm_approach",

        [113] = "ground_call",
        [114] = "connect_gpu",
        [115] = "disconnect_gpu",
        [116] = "connect_asu",
        [117] = "disconnect_asu",
        [118] = "connect_acu",
        [119] = "disconnect_acu",
        [120] = "disconnect_all_ground",
        [121] = "confirmed",
        [122] = "ta_ra",
        [123] = "cont_relight",
        [124] = "secure",
        [125] = "on_apu",
        [126] = "apu_tbs",
        [127] = "brakes_on_chocks_on",
        [128] = "engine_start_3",

        [150] = "flaps_ten",
        [151] = "flaps_eleven",
        [152] = "flaps_twelve",
        [153] = "flaps_thirteen",
        [154] = "flaps_fourteen",
        [156] = "flaps_sixteen",
        [157] = "flaps_seventeen",
        [158] = "flaps_eighteen",
        [159] = "flaps_nineteen",
        [160] = "flaps_twenty",
        [161] = "flaps_twenty_one",
        [162] = "flaps_twenty_two",
        [163] = "flaps_twenty_three",
        [164] = "flaps_twenty_four",
        [165] = "flaps_twenty_five"

        };

        private static VoiceCommand? DispatchDiscrete(int pid, string raw)
        {
            if (!DiscreteNames.TryGetValue(pid, out var name))
                return null;
            return Cmd("discrete", raw, new() { ["command"] = name });
        }

        // ─── Helper ───────────────────────────────────────────────────────────────

        private static VoiceCommand Cmd(
            string type,
            string raw,
            Dictionary<string, object> payload
        ) => new(type, raw, payload);
    }
}
