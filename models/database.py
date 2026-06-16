from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

def init_db(app):
    with app.app_context():
        from models.users import User
        from models.complaints import Complaint
        from models.chat_history import ChatHistory
        db.create_all()

        # Seed default demo user
        from werkzeug.security import generate_password_hash
        if not User.query.filter_by(email="demo@medichat.com").first():
            demo = User(
                name="Demo User",
                email="demo@medichat.com",
                password_hash=generate_password_hash("demo1234"),
                age=25,
                gender="Male",
                blood_group="O+",
                allergies="None",
                chronic_conditions="None"
            )
            db.session.add(demo)
            db.session.commit()