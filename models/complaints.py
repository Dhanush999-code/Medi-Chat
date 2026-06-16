from models.database import db
from datetime import datetime

class Complaint(db.Model):
    __tablename__ = "complaints"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    doctor_name = db.Column(db.String(150))
    hospital = db.Column(db.String(200))
    category = db.Column(db.String(100))
    description = db.Column(db.Text)
    date_of_incident = db.Column(db.String(50))
    status = db.Column(db.String(50), default="Submitted")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)