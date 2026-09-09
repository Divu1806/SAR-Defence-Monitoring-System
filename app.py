import os, random, json, base64, threading
import cv2
import numpy as np
import tensorflow as tf
from ultralytics import YOLO
from flask import Flask, jsonify, render_template

YOLO_MODEL = os.path.join("models", "best.pt")

BROAD_MODEL = os.path.join(
    "models",
    "broad_category_classifier.keras"
)

BROAD_CLASSES_FILE = os.path.join(
    "models",
    "broad_classes.json"
)

SPECIFIC_MODEL = os.path.join(
    "models",
    "specific_vehicle_identifier_v3.keras"
)

SPECIFIC_CLASSES_FILE = os.path.join(
    "models",
    "specific_classes.json"
)

TEST_IMAGE_FOLDER = os.path.join(
    "test_images"
)

app = Flask(__name__)
yolo = cnn1 = cnn2 = None
cnn1_classes = cnn2_classes = []
models_ready = False
model_error = None
YOLO_CONFIDENCE = 0.25
CNN_IMAGE_SIZE = (128, 128)

def load_classes(path):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    classes = [None] * len(data)
    for name, index in data.items():
        classes[int(index)] = name
    return classes

def calculate_threat(vehicle_type, yolo_confidence, broad_confidence, specific_confidence):
    scores = {"2S1":75,"BMP2":55,"BRDM2":55,"BTR60":55,"BTR70":55,
              "D7":40,"T62":75,"T72":75,"ZIL131":40,"ZSU23_4":75}
    name = str(vehicle_type).strip().upper()
    score = scores.get(name, 30) + (
        (yolo_confidence + broad_confidence + specific_confidence) / 3
    ) * 20
    score = max(0, min(100, score))
    if name in ("2S1","T62","T72","ZSU23_4"):
        level = "CRITICAL" if score >= 85 else "HIGH"
    elif name in ("BMP2","BRDM2","BTR60","BTR70"):
        level = "HIGH" if score >= 70 else "MEDIUM"
    elif name in ("D7","ZIL131"):
        level = "MEDIUM" if score >= 55 else "LOW"
    else:
        level = "LOW" if score <= 25 else "MEDIUM" if score <= 50 else "HIGH" if score <= 75 else "CRITICAL"
    return round(score, 2), level

def preprocess(crop, model):
    channels = model.input_shape[-1]
    image = cv2.resize(crop, CNN_IMAGE_SIZE)
    if channels == 1:
        image = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        image = np.expand_dims(image.astype(np.float32)/255.0, -1)
    elif channels == 3:
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB).astype(np.float32)/255.0
    else:
        raise ValueError("Unsupported CNN channels: " + str(channels))
    return np.expand_dims(image, 0)

def predict(model, classes, crop):
    p = np.asarray(model.predict(preprocess(crop, model), verbose=0))
    i = int(np.argmax(p[0]))
    return (classes[i] if i < len(classes) else f"Unknown_{i}"), float(p[0][i])

def load_models():
    global yolo, cnn1, cnn2, cnn1_classes, cnn2_classes, models_ready, model_error
    try:
        yolo = YOLO(YOLO_MODEL)
        cnn1 = tf.keras.models.load_model(BROAD_MODEL, compile=False)
        cnn1_classes = load_classes(BROAD_CLASSES_FILE)
        cnn2 = tf.keras.models.load_model(SPECIFIC_MODEL, compile=False)
        cnn2_classes = load_classes(SPECIFIC_CLASSES_FILE)
        models_ready, model_error = True, None
    except Exception as e:
        models_ready, model_error = False, str(e)

def encode_image(image):
    ok, data = cv2.imencode(".jpg", image)
    if not ok: raise ValueError("Could not encode result image.")
    return "data:image/jpeg;base64," + base64.b64encode(data).decode()

def process():
    if not models_ready:
        raise RuntimeError(model_error or "Models are not ready.")
    files = [os.path.join(TEST_IMAGE_FOLDER,f) for f in os.listdir(TEST_IMAGE_FOLDER)
             if f.lower().endswith((".jpg",".jpeg",".png",".bmp"))]
    if not files: raise FileNotFoundError("No test images found in: " + TEST_IMAGE_FOLDER)
    path = random.choice(files)
    image = cv2.imread(path)
    if image is None: raise ValueError("Could not read selected image.")
    results = yolo.predict(source=path, conf=YOLO_CONFIDENCE, verbose=False)
    rows = []
    for result in results:
        if result.boxes is None: continue
        h,w = image.shape[:2]
        for box in result.boxes:
            cid = int(box.cls[0]); yc = float(box.conf[0])
            x1,y1,x2,y2 = map(int, box.xyxy[0].tolist())
            x1=max(0,min(x1,w-1)); y1=max(0,min(y1,h-1))
            x2=max(0,min(x2,w)); y2=max(0,min(y2,h))
            crop=image[y1:y2,x1:x2]
            if crop.size == 0: continue
            broad, bc = predict(cnn1, cnn1_classes, crop)
            specific, sc = predict(cnn2, cnn2_classes, crop)
            score, threat = calculate_threat(specific,yc,bc,sc)
            rows.append({"yolo_confidence":yc,"broad":broad,"broad_confidence":bc,
                         "specific":specific,"specific_confidence":sc,"score":score,
                         "threat":threat,"box":[x1,y1,x2,y2]})
    for r in rows:
        color={"CRITICAL":(0,0,255),"HIGH":(0,140,255),
               "MEDIUM":(0,220,220),"LOW":(0,200,0)}[r["threat"]]
        x1,y1,x2,y2=r["box"]
        cv2.rectangle(image,(x1,y1),(x2,y2),color,3)
        cv2.putText(image,f'{r["specific"]} | {r["threat"]} | {r["score"]:.2f}',
                    (x1,max(y1-10,20)),cv2.FONT_HERSHEY_SIMPLEX,.52,color,2,cv2.LINE_AA)
    return {"filename":os.path.basename(path),"image":encode_image(image),
            "results":rows,"critical_count":sum(r["threat"]=="CRITICAL" for r in rows),
            "vehicle_count":len(rows)}

@app.route("/")
def index(): return render_template("index.html")

@app.route("/api/status")
def status(): return jsonify({"ready":models_ready,"error":model_error})

@app.route("/api/random-test", methods=["POST"])
def random_test():
    try: return jsonify({"success":True,**process()})
    except Exception as e: return jsonify({"success":False,"error":str(e)}),500

if __name__ == "__main__":
    load_models()
    print("Open http://127.0.0.1:5000")
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)
