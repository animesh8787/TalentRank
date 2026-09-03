"""Promote a registered user to admin.

There's no seeded admin password anymore — Firebase owns sign-up. Bootstrap
your first admin by registering normally through the app (as recruiter or
candidate, whichever the sign-up form offers), then running:

    python -m app.promote_admin you@example.com
"""
from __future__ import annotations

import sys

from sqlalchemy import select

from app.core.database import SessionLocal
from app.models import User, UserRole


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python -m app.promote_admin <email>")
        return 1

    email = sys.argv[1].strip().lower()
    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            print(f"No user found with email {email!r}. Register through the app first.")
            return 1

        if user.role is UserRole.ADMIN:
            print(f"{email} is already an admin.")
            return 0

        previous = user.role.value
        user.role = UserRole.ADMIN
        db.add(user)
        db.commit()
        print(f"{email}: {previous} -> admin")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
