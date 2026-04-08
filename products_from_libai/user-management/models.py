"""
用户数据模型
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

@dataclass
class User:
    id: str
    email: str
    password_hash: str
    full_name: Optional[str] = None
    api_key: Optional[str] = None
    subscription_tier: str = 'free'
    subscription_expires: Optional[datetime] = None
    created_at: datetime = None
    last_login: Optional[datetime] = None
    is_active: bool = True

    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'full_name': self.full_name,
            'subscription_tier': self.subscription_tier,
            'subscription_expires': self.subscription_expires.isoformat() if self.subscription_expires else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'is_active': self.is_active,
        }

@dataclass
class Subscription:
    id: str
    user_id: str
    tier: str
    start_date: datetime
    end_date: datetime
    status: str = 'active'  # active, cancelled, expired
    payment_id: Optional[str] = None

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'tier': self.tier,
            'start_date': self.start_date.isoformat(),
            'end_date': self.end_date.isoformat(),
            'status': self.status,
            'payment_id': self.payment_id,
        }
