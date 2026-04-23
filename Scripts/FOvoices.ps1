# This script uses Azure Cognitive Services for high-quality TTS
# You'll need a free Azure account: https://azure.microsoft.com/free/

# === LOAD .env ===


# === CONFIGURATION ===

$voicesToGenerate = @(
    "en-US-JennyNeural", 
    "en-US-AriaNeural", 
    "en-US-GuyNeural", 
    "en-US-ChristopherNeural"
)

# Other voices:
# "en-US-AriaNeural"  - Female, friendly
# "en-US-GuyNeural"   - Male, professional
# "en-US-DavisNeural" - Male, authoritative
# "en-US-JennyNeural"  - Female, clear

$phrases = @{
"0"                                    = "Zero"
"0_taxi"                               = "Zero taxi"
"1"                                    = "One"
"1013_set"                             = "One zero one three set"
"2"                                    = "Two"
"20"                                   = "Twenty"
"2992_set"                             = "Two niner niner two set"
"3"                                    = "Three"
"3_anu"                                = "Three degrees nose up set"
"4"                                    = "Four"
"4_green"                              = "Four green"
"5"                                    = "Five"
"6"                                    = "Six"
"60_knots"                             = "Sixty knots"
"7"                                    = "Seven"
"8"                                    = "Eight"
"80_knots"                             = "Eighty knots"
"80_knots_clamp"                       = "Eighty knots, clamp"
"9"                                    = "Niner"

"after_landing_checklist_completed"    = "After Landing checklist completed"
"after_start_checklist_completed"      = "After start checklist completed"
"after_takeoff_completed_to_the_line"  = "After Takeoff Checklist completed to the line"
"after_takeoff_completed"               = "After takeoff checklist completed"
"afs"                                    = "Autoflight"
"air_panel"                             = "Air Panel"
"altimeters"                           = "Altimeters"
"anti_ice"                             = "Anti ice"
"apu"                                  = "APU"
"apu_reminder"                         = "Let me know when to start the APU"
"are_you_sure"                         = "Are you sure?"
"armed"                                = "Armed"
"auto"                                 = "Auto"
"auto_brake"                           = "Auto brake"


"beacon"                               = "beacon"
"before_landing_checklist_completed"          = "Before landing checklist completed"
"before_start_checklist_completed"     = "Before start checklist completed"
"before_takeoff_checklist_completed"    = "Before takeoff checklist completed"

"cabin_landing"                        = "Cabin crew, please be seated for landing"
"cabin_report"                         = "Cabin report"
"cabin_takeoff"                        = "Cabin crew, please be seated for takeoff"
"cabin_secure"                         = "Flight deck. Ok. Captain, cabin is ready"
"cabin_not_secure"                         = "We didn't get a call if cabin is ready."
"check"                                = "Check"
"check_flaps"                          = "Check flaps"
"check_landing_gear"                   = "Check landing gear"
"check_seatbelts"                      = "Check seatbelts"
"check_speed"                          = "Check speed"
"check_spoilers"                       = "Check spoilers"
"check_thrust"                         = "Check thrust"
"checked"                              = "Checked"
"clear_right"                          = "Clear right"
"cockpit_preparation_checklist_complete" = "Cockpit preparation checklist complete"

"confirmed"                            = "Confirmed"
"dh_mda"                               = "DH MDA"
"disarmed"                             = "Disarmed"
"decel"                                = "Deecel"
"desappr_checklist_completed"         = "Descent Approach checklist completed"

"ead"                                  = "E A D"
"ext_lights"                           = "Exterior lights"
"emer_pwr"                             = "Emergency power"
"engineai"                             = "Engine anti ice is on"
"enginefoilai"                         = "Engine and airfoil anti ice is on"
"engines_off"                          = "Ready to cut engines captain"
"evac_cmd"                             = "EVAC Command"

"fire_test"                            = "Fire test"
"feet_set"                             = "Feet set"      
"final_cockpit_prep"                   = "I am now doing the Final Cockpit Preparation procedure"
"fl_100"                               = "Flight level one hundred"
"flap_to"                              = "Flaps takeoff selector"
"flaps" = "Flaps"
"flaps_slats" = "Flaps and slats"
"flaps_up" = "Flaps up"
"flaps_10" = "Flaps ten"
"flaps_11" = "Flaps eleven"
"flaps_12" = "Flaps twelve"
"flaps_13" = "Flaps thirteen"
"flaps_14" = "Flaps fourteen"
"flaps_15" = "Flaps fifteen"
"flaps_16" = "Flaps sixteen"
"flaps_17" = "Flaps seventeen"
"flaps_18" = "Flaps eighteen"
"flaps_19" = "Flaps nineteen"
"flaps_20" = "Flaps twenty"
"flaps_21" = "Flaps twenty one"
"flaps_22" = "Flaps twenty two"
"flaps_23" = "Flaps twenty three"
"flaps_24" = "Flaps twenty four"
"flaps_25" = "Flaps twenty five"
"flaps_28" = "Flaps twenty eight"
"flaps_35" = "Flaps thirty five"
"flaps_50" = "Flaps fifty"
"flight_controls"                      = "Flight controls"
"fms"                                  = "FMS"
"fcp"                                  = "FCP"
"fuel_panel"                          = "Fuel panel"
"fuel_sw"                             = "Fuel switches"
"full_down"                           = "Full down, two green"
"full_left"                           = "Full left, three green"
"full_right"                          = "Full right, three green"
"full_up"                             = "Full up, two green"

"gear_lts"                                 = "Gear and lights"
"gear_down"                            = "Gear down"
"gear_up"                              = "Gear up"
"ground_fd"                            = "Ground from flight deck"
"ground_pins"                         = "Ground equipment and gear pins"

"hold_at_altm"                       = "Holding at altimeters"
"hyd_panel"                           = "Hydraulics panel"
"hyd_test"                            = "can we perform the hydraulics test?"

"ign"                                  = "Engine ignition"
"irs"                                  = "IRS"
"ldg_data" = "Landing data"
"locked" = "Locked"
"lts" = "High intensity and landing lights"

"missed_approach"                      = "Missed approach altitude"
"missed_approach_set"                      = "Missed approach altitude set"
"min"                                  = "Min"
"med"                                  = "Med"
"max"                                  = "Max"

"nav_prof_armed"                       = "Nav and profile armed"
"navigation"                           = "Navigation"
"neutral"                              = "Neutral"
"no_reverse"            = "No reverse"
"no_spoilers"                          = "No spoilers"
"now_at"                               = "Now"

"off"                                  = "off"
"on"                                   = "on"
"on_tara"                              = "On and T A R A"
"off_tara"                              = "Off and T A R A"
"Ok"                                   = "Ok"
"one_to_go"                            = "One thousand to go"
"oxy_system"                           = "Oxygen System and Mask"

"parking_brake"                        = "Parking brake"
"parking_checklist_completed"          = "Parking checklist completed"
"pitch_trim"                           = "Pitch Trim"
"positive_climb"                       = "Positive climb"
"point"                                = "Point"

"radar"                                = "Weather Radar"
"ready"                                = "Ready"
"reviewed"                             = "Reviewed"
"retracted"                            = "Retracted"
"reverse_thr"                        = "Reverse thrust available"
"rotate"                               = "Rotate"
"rud_ail"                              = "Rudder and aileron trim"

"sd_status"                            = "SD Status"
"set"                                  = "Set"
"set_100"                               = "Set one hundred percent"
"seat_belts"                               =  "Seat belts"
"slats_ext"                           = "Slats extended"
"slats_retr"                          = "Slats retracted"
"speed_checked"                       = "Speed checked"
"spoilers"                            = "Spoilers"
"spoilers_dep"                            = "Spoilers deployed"
"stab_trim"                           = "Stabilizer trim"
"standard_set"                        = "Standard Set and cross checked"

"taxi_completed"                       = "Taxi checklist completed"
"tcas"                                 = "T cas"
"ten_thousand"                         = "Ten thousand"
"thousand"                             = "Thousand"
"thrust_set"                           = "Thrust set"
"to"                                   = "Takeoff"
"to_data"                              = "Takeoff data"
"to_wrng"                              = "Takeoff Warning"
"tons"                                 = "Tons"
"transiton_altitude"                   = "Transition altitude"
"transiton_level"                     = "Transition level"
"up_lts_off"                          = "Up and lights off"
"up_ret"                               = "Up and retracted"
"units_set"                            = "degrees nose up set"
"v_one"                                = "V one"
"walkaround"                           = "I'll perform the walkaround now"
"walkaround_completed"                 = "Walkaround completed, all good no issues found"
"wing_lights"                          = "Wing lights"
"windows"                              = "Doors and windows"
"wshld_ai"                             = "Windshield anti ice"
"wxr_xpndr"                            = "Weather radar and transponder"
"xchk"                                 = "Cross checked"
}
# Derive folder name from voice: "en-US-JennyNeural" -> "Jenny"

# Find Python automatically
$pythonExe = Get-Command python.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $pythonExe) { $pythonExe = "py" } # Fallback to launcher


# === DYNAMIC FFmpeg SEARCH ===
$ffmpegExe = Get-Command ffmpeg -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source

if (-not $ffmpegExe) {
    # Fallback to your specific path if it's not in the System PATH
    $ffmpegExe = "C:\Users\extra\Downloads\Wwise-Unpacker-master\Tools\ffmpeg.exe"
}

if (-not (Test-Path $ffmpegExe)) {
    Write-Error "FFmpeg NOT FOUND! Please install it or check the path: $ffmpegExe"
    exit 1
}
Write-Host "Using FFmpeg from: $ffmpegExe" -ForegroundColor Yellow

# === VOICE GENERATION LOOP ===
foreach ($voiceName in $voicesToGenerate) {
    
    $voiceShortName = ($voiceName -replace '^.*-([A-Za-z]+)Neural$', '$1')
    $outDir = Join-Path $PSScriptRoot "..\src-tauri\sounds\$voiceShortName"
    $outDir = [System.IO.Path]::GetFullPath($outDir)
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null

    Write-Host "`n>>> STARTING VOICE: $voiceShortName" -ForegroundColor Cyan

    foreach ($file in $phrases.Keys) {
        $text = $phrases[$file]
        $mp3Path = "$outDir\$file.mp3"
        $oggPath = "$outDir\$file.ogg"

        try {
            # Use edge-tts (free)
            edge-tts --voice $voiceName --text "$text" --write-media "$mp3Path"
            
            # Convert to OGG
            if (Test-Path $mp3Path) {
                & $ffmpegExe -i "$mp3Path" -c:a libvorbis -q:a 4 "$oggPath" -y -loglevel error
                Remove-Item $mp3Path -ErrorAction SilentlyContinue
                Write-Host "  [OK] $file"
            }
        }
        catch {
            Write-Error "Failed $file : $_"
        }
    }
}

Write-Host "Completed! Audio files created in $outDir"