from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_session import Session
import os
import google.generativeai as genai
app=Flask(__name__)

app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
GEMINI_API_KEY = "GEMINI_API_KEY"
from PIL import Image
import io
import base64
genai.configure(api_key=GEMINI_API_KEY)

model = genai.GenerativeModel("gemini-2.5-flash")
from datetime import datetime
from werkzeug.utils import secure_filename
from werkzeug.security import check_password_hash, generate_password_hash
from models.database import db, init_db
from models.users import User
from models.complaints import Complaint
from models.chat_history import ChatHistory

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "medi-chat-secret-2024")
app.config["SESSION_TYPE"] = "filesystem"
app.config["UPLOAD_FOLDER"] = "uploads"
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16MB max
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///medichat.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "pdf", "txt"}

Session(app)
db.init_app(app)

with app.app_context():
    init_db(app)

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

# ─────────────────────────────────────────────
# AUTH ROUTES
# ─────────────────────────────────────────────

@app.route("/")
def index():
    if "user_id" in session:
        return redirect(url_for("chat"))
    return render_template("login.html")

@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        data = request.get_json()
        name = data.get("name", "").strip()
        email = data.get("email", "").strip().lower()
        password = data.get("password", "")
        age = data.get("age", "")
        gender = data.get("gender", "")

        if User.query.filter_by(email=email).first():
            return jsonify({"success": False, "message": "Email already registered."})

        user = User(
            name=name,
            email=email,
            password_hash=generate_password_hash(password),
            age=age,
            gender=gender,
            created_at=datetime.utcnow()
        )
        db.session.add(user)
        db.session.commit()
        return jsonify({"success": True, "message": "Registration successful!"})
    return render_template("register.html")

@app.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    user = User.query.filter_by(email=email).first()
    if user and check_password_hash(user.password_hash, password):
        session["user_id"] = user.id
        session["user_name"] = user.name
        return jsonify({"success": True})
    return jsonify({"success": False, "message": "Invalid email or password."})

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))

# ─────────────────────────────────────────────
# MAIN CHAT PAGE
# ─────────────────────────────────────────────

@app.route("/chat")
def chat():
    if "user_id" not in session:
        return redirect(url_for("index"))
    user = User.query.get(session["user_id"])
    return render_template("chat.html", user=user)

# ─────────────────────────────────────────────
# AI CHAT API
# ─────────────────────────────────────────────
@app.route("/api/chat", methods=["POST"])
def api_chat():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()

    user_message = data.get("message", "")
    image_data = data.get("image", None)

    try:

        prompt = f"""
You are Medi-Chat, a professional AI medical assistant.

Rules:
- Never prescribe medicines.
- Recommend consulting doctors for serious issues.
- Explain medicines and health concepts clearly.
- Give safe medical guidance.

User:
{user_message}
"""

        response = model.generate_content(prompt)

        ai_reply = response.text

        chat = ChatHistory(
            user_id=session["user_id"],
            user_message=user_message,
            ai_response=ai_reply,
            timestamp=datetime.utcnow()
        )

        db.session.add(chat)
        db.session.commit()

        return jsonify({"reply": ai_reply})

    except Exception as e:
        print("Gemini Error:", e)
        return jsonify({"reply": str(e)}), 500


# ─────────────────────────────────────────────
# BILL VERIFICATION
# ─────────────────────────────────────────────
@app.route("/api/verify-bill", methods=["POST"])
def verify_bill():

    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()

    bill_text = data.get("bill_text", "")
    location = data.get("location", "India")

    prompt = f"""
You are a medical billing expert.

Analyze this bill from {location}.

Bill:
{bill_text}

Provide:
1. Medicine names
2. Estimated price ranges
3. Overpriced items
4. Final verdict
"""

    try:
        response = model.generate_content(prompt)

        return jsonify({
            "analysis": response.text
        })

    except Exception as e:
        return jsonify({
            "analysis": str(e)
        }), 500


# ─────────────────────────────────────────────
# FILE COMPLAINT
# ─────────────────────────────────────────────

@app.route("/api/complaint", methods=["POST"])
def file_complaint():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    complaint = Complaint(
        user_id=session["user_id"],
        doctor_name=data.get("doctor_name", ""),
        hospital=data.get("hospital", ""),
        category=data.get("category", ""),
        description=data.get("description", ""),
        date_of_incident=data.get("date", ""),
        status="Submitted",
        created_at=datetime.utcnow()
    )
    db.session.add(complaint)
    db.session.commit()

    return jsonify({
        "success": True,
        "complaint_id": f"MC-{complaint.id:05d}",
        "message": "Complaint filed successfully. Reference ID: MC-{:05d}".format(complaint.id)
    })

@app.route("/api/complaints", methods=["GET"])
def get_complaints():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    complaints = Complaint.query.filter_by(user_id=session["user_id"]).all()
    return jsonify([{
        "id": f"MC-{c.id:05d}",
        "doctor": c.doctor_name,
        "hospital": c.hospital,
        "category": c.category,
        "status": c.status,
        "date": c.created_at.strftime("%d %b %Y")
    } for c in complaints])

# ─────────────────────────────────────────────
# MEDICINE ANALYSIS (image upload)
# ─────────────────────────────────────────────
@app.route("/api/analyze-medicine", methods=["POST"])
def analyze_medicine():

    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    image_data = data.get("image", "")

    if not image_data:
        return jsonify({"error": "No image provided"}), 400

    try:

        img_b64 = image_data.split(",")[1]
        image_bytes = base64.b64decode(img_b64)

        image = Image.open(io.BytesIO(image_bytes))

        response = model.generate_content([
            "Analyze this medicine image. Identify the medicine if possible, explain uses, side effects, dosage, warnings, and approximate price range in India.",
            image
        ])

        return jsonify({
            "analysis": response.text
        })

    except Exception as e:

        return jsonify({
            "analysis": str(e)
        }), 500

# ─────────────────────────────────────────────
# CHAT HISTORY
# ─────────────────────────────────────────────

@app.route("/api/history", methods=["GET"])
def chat_history():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    history = ChatHistory.query.filter_by(user_id=session["user_id"])\
        .order_by(ChatHistory.timestamp.desc()).limit(20).all()
    return jsonify([{
        "user": h.user_message,
        "ai": h.ai_response,
        "time": h.timestamp.strftime("%d %b %Y, %I:%M %p")
    } for h in history])

# ─────────────────────────────────────────────
# HEALTH TIPS API
# ─────────────────────────────────────────────
@app.route("/api/health-tip", methods=["GET"])
def health_tip():

    try:

        response = model.generate_content(
            "Give one short practical health tip."
        )

        return jsonify({
            "tip": response.text
        })

    except:

        return jsonify({
            "tip": "Drink plenty of water and sleep at least 7-8 hours daily."
        })


# ─────────────────────────────────────────────
# PROFILE
# ─────────────────────────────────────────────

@app.route("/api/profile", methods=["GET", "POST"])
def profile():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    user = User.query.get(session["user_id"])
    if request.method == "POST":
        data = request.get_json()
        user.name = data.get("name", user.name)
        user.age = data.get("age", user.age)
        user.gender = data.get("gender", user.gender)
        user.blood_group = data.get("blood_group", user.blood_group)
        user.allergies = data.get("allergies", user.allergies)
        user.chronic_conditions = data.get("chronic_conditions", user.chronic_conditions)
        db.session.commit()
        return jsonify({"success": True})
    return jsonify({
        "name": user.name,
        "email": user.email,
        "age": user.age,
        "gender": user.gender,
        "blood_group": user.blood_group or "",
        "allergies": user.allergies or "",
        "chronic_conditions": user.chronic_conditions or ""
    })

if __name__ == "__main__":
    app.run(debug=True, port=5000)