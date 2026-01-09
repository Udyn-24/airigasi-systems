from flask import Flask, request, jsonify, render_template
from datetime import datetime
import threading
import time
import random

app = Flask(__name__, static_folder='static', template_folder='templates')

# --- GLOBAL DATA STORE ---
room_data = {
    "temperature_c": 0,
    "humidity": 0,
    "soil_percent": 0,
    "soil_raw": 0,
    "device": "Waiting..."
}
history_log = []

# --- SIMULATION STATE ---
simulation_active = False

def generate_fake_data():
    """Background thread that acts like a fake Raspberry Pi"""
    global room_data, history_log, simulation_active
    
    # Starting values
    temp = 28.0
    hum = 60.0
    soil = 50.0
    
    # Counter for how long the "Erratic Mode" lasts
    erratic_counter = 0

    while True:
        if simulation_active:
            # 1. Check if we are in "Erratic Mode"
            if erratic_counter > 0:
                # --- GLITCH MODE (Big Jumps) ---
                temp += random.uniform(-3.0, 3.0)   # Jump up to 3 degrees
                hum += random.uniform(-8.0, 8.0)    # Jump up to 8% humidity
                soil += random.uniform(-10.0, 10.0) # Jump up to 10% soil
                
                erratic_counter -= 1 # Count down
                status_label = f"⚠️ ERRATIC ({erratic_counter})"
            else:
                # --- NORMAL MODE (Smooth) ---
                temp += random.uniform(-0.3, 0.3)
                hum += random.uniform(-1.0, 1.0)
                soil += random.uniform(-1.0, 1.0)
                status_label = "SIMULATOR"

                # 5% Chance to trigger Erratic Mode for next 5 readings
                if random.random() < 0.05:
                    erratic_counter = 5

            # 2. Clamp values to keep them somewhat realistic
            temp = max(15, min(45, temp))
            hum = max(10, min(100, hum))
            soil = max(0, min(100, soil))

            # 3. Update Live Data
            room_data = {
                "temperature_c": round(temp, 1),
                "humidity": int(hum),
                "soil_percent": int(soil),
                "soil_raw": 0,
                "device": status_label # Shows "ERRATIC" in the UI
            }

            # 4. Update History Log
            now = datetime.now().strftime("%H:%M:%S")
            log_entry = {
                "time": now,
                "temp": round(temp, 1),
                "hum": int(hum),
                "soil": int(soil)
            }
            history_log.append(log_entry)
            
            # Keep last 30 readings (60 seconds)
            if len(history_log) > 30: 
                history_log.pop(0)

            print(f"🤖 {status_label}: {room_data}")
        
        time.sleep(2.0)

threading.Thread(target=generate_fake_data, daemon=True).start()

# --- ROUTES ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/collect', methods=['POST'])
def collect_data():
    global room_data, history_log
    if simulation_active:
        return jsonify({"status": "ignored", "reason": "simulation_active"}), 200

    incoming = request.json
    if incoming:
        room_data = incoming
        
        # Add to history
        now = datetime.now().strftime("%H:%M:%S")
        log_entry = {
            "time": now,
            "temp": incoming.get("temperature_c", 0),
            "hum": incoming.get("humidity", 0),
            "soil": incoming.get("soil_percent", 0)
        }
        history_log.append(log_entry)
        
        # <--- CHANGE 2: Keep last 30 readings (60 seconds)
        if len(history_log) > 30:
            history_log.pop(0)
            
        print(f"✅ Received: {room_data}")
        return jsonify({"status": "saved"}), 200
    return jsonify({"status": "error"}), 400

@app.route('/sensor-read', methods=['GET'])
def get_sensor_data():
    return jsonify(room_data)

@app.route('/history', methods=['GET'])
def get_history_data():
    return jsonify(history_log)

# Find this section in server.py and REPLACE it
@app.route('/toggle-sim', methods=['POST'])
def toggle_sim():
    global simulation_active, room_data  # <--- Add room_data here
    data = request.json
    simulation_active = data.get('active', False)
    
    if simulation_active:
        status = "ON"
    else:
        status = "OFF"
        # <--- NEW: Wipe the data when stopping!
        room_data = {
            "temperature_c": 0,
            "humidity": 0,
            "soil_percent": 0,
            "soil_raw": 0,
            "device": "Simulation Stopped"
        }

    print(f"🔄 Simulation switched {status}")
    return jsonify({"status": status, "active": simulation_active})
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)