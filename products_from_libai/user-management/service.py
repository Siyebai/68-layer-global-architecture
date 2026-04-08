"""
用户管理服务
"""

import os
import sys
import uuid
import hashlib
from datetime import datetime, timedelta
from typing import Optional, List
import psycopg2
from psycopg2.extras import RealDictCursor

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from products.user-management.models import User, Subscription

class UserManager:
    def __init__(self):
        self.db_url = os.getenv('DATABASE_URL')
        self.conn = None
        self.connect()

    def connect(self):
        """连接数据库"""
        self.conn = psycopg2.connect(self.db_url, cursor_factory=RealDictCursor)
        self.conn.autocommit = True

    def create_user(self, email: str, password: str, full_name: Optional[str] = None) -> User:
        """创建新用户"""
        user_id = str(uuid.uuid4()).replace('-', '')[:16]
        password_hash = self._hash_password(password)
        api_key = self._generate_api_key()
        created_at = datetime.now()

        with self.conn.cursor() as cur:
            cur.execute("""
                INSERT INTO users (id, email, password_hash, full_name, api_key, created_at, is_active)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING *
            """, (user_id, email, password_hash, full_name, api_key, created_at, True))
            row = cur.fetchone()

        return User(
            id=row['id'],
            email=row['email'],
            password_hash=row['password_hash'],
            full_name=row['full_name'],
            api_key=row['api_key'],
            created_at=row['created_at'],
            is_active=row['is_active']
        )

    def get_user_by_email(self, email: str) -> Optional[User]:
        """通过邮箱获取用户"""
        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE email = %s", (email,))
            row = cur.fetchone()
            if not row:
                return None
            return self._row_to_user(row)

    def get_user_by_id(self, user_id: str) -> Optional[User]:
        """通过ID获取用户"""
        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
            row = cur.fetchone()
            if not row:
                return None
            return self._row_to_user(row)

    def get_user_by_api_key(self, api_key: str) -> Optional[User]:
        """通过API Key获取用户"""
        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE api_key = %s", (api_key,))
            row = cur.fetchone()
            if not row:
                return None
            return self._row_to_user(row)

    def authenticate(self, email: str, password: str) -> Optional[User]:
        """用户认证"""
        user = self.get_user_by_email(email)
        if not user:
            return None

        if not self._verify_password(password, user.password_hash):
            return None

        # 更新最后登录时间
        with self.conn.cursor() as cur:
            cur.execute("UPDATE users SET last_login = NOW() WHERE id = %s", (user.id,))

        return user

    def update_subscription(self, user_id: str, tier: str, duration_days: int = 30) -> Subscription:
        """更新用户订阅"""
        start_date = datetime.now()
        end_date = start_date + timedelta(days=duration_days)
        sub_id = str(uuid.uuid4()).replace('-', '')[:16]

        with self.conn.cursor() as cur:
            cur.execute("""
                INSERT INTO subscriptions (id, user_id, tier, start_date, end_date, status)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING *
            """, (sub_id, user_id, tier, start_date, end_date, 'active'))

            # 更新用户订阅等级
            cur.execute("UPDATE users SET subscription_tier = %s WHERE id = %s", (tier, user_id))

            row = cur.fetchone()

        return Subscription(
            id=row['id'],
            user_id=row['user_id'],
            tier=row['tier'],
            start_date=row['start_date'],
            end_date=row['end_date'],
            status=row['status']
        )

    def get_user_subscription(self, user_id: str) -> Optional[Subscription]:
        """获取用户当前订阅"""
        with self.conn.cursor() as cur:
            cur.execute("""
                SELECT * FROM subscriptions
                WHERE user_id = %s AND status = 'active'
                AND end_date > NOW()
                ORDER BY start_date DESC
                LIMIT 1
            """, (user_id,))
            row = cur.fetchone()
            if not row:
                return None
            return Subscription(
                id=row['id'],
                user_id=row['user_id'],
                tier=row['tier'],
                start_date=row['start_date'],
                end_date=row['end_date'],
                status=row['status']
            )

    def _hash_password(self, password: str) -> str:
        """哈希密码"""
        salt = os.getenv('PASSWORD_SALT', 'default-salt')
        return hashlib.sha256((password + salt).encode()).hexdigest()

    def _verify_password(self, password: str, hash_value: str) -> bool:
        """验证密码"""
        return self._hash_password(password) == hash_value

    def _generate_api_key(self) -> str:
        """生成API Key"""
        raw = f"{uuid.uuid4().hex}{uuid.uuid4().hex}"
        return f"libai_{raw[:32]}"

    def _row_to_user(self, row) -> User:
        """将数据库行转换为User对象"""
        return User(
            id=row['id'],
            email=row['email'],
            password_hash=row['password_hash'],
            full_name=row.get('full_name'),
            api_key=row.get('api_key'),
            subscription_tier=row.get('subscription_tier', 'free'),
            subscription_expires=row.get('subscription_expires'),
            created_at=row['created_at'],
            last_login=row.get('last_login'),
            is_active=row.get('is_active', True)
        )

# 全局实例
_user_manager: Optional[UserManager] = None

def get_user_manager() -> UserManager:
    global _user_manager
    if _user_manager is None:
        _user_manager = UserManager()
    return _user_manager

if __name__ == '__main__':
    # 简单测试
    um = UserManager()
    print("用户管理服务已初始化")
