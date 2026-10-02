// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    crewmate_core::install_panic_hook();
    crewmatemd11_lib::run()
}
