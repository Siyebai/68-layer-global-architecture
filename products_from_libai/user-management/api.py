"""
用户管理 REST API
"""

import os
import sys
from datetime import datetime
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from products.user-management.service import get_user_manager, User

app = FastAPI(title="Libai User Management API", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 依赖注入
def get_manager():
    return get_user_manager()

def verify_api_key(x_api_key: str = Header(None)):
    """验证API Key"""
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing API Key")
    manager = get_user_manager()
    user = manager.get_user_by_api_key(x_api_key)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    return user

@app.post("/users")
async def create_user(
    email: str,
    password: str,
    full_name: str = None,
    manager = Depends(get_manager)
):
    """创建用户"""
    try:
        user = manager.create_user(email, password, full_name)
        return {"success": True, "data": user.to_dict()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/auth/login")
async def login(
    email: str,
    password: str,
    manager = Depends(get_manager)
):
    """用户登录"""
    user = manager.authenticate(email, password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    # 生成JWT token（简化实现）
    token = f"Bearer {user.api_key}"
    return {"success": True, "data": {"token": token, "user": user.to_dict()}}

@app.get("/users/me")
async def get_current_user(user: User = Depends(verify_api_key)):
    """获取当前用户信息"""
    return {"success": True, "data": user.to_dict()}

@app.get("/subscriptions")
async def get_my_subscription(user: User = Depends(verify_api_key)):
    """获取用户订阅"""
    manager = get_user_manager()
    sub = manager.get_user_subscription(user.id)
    if not sub:
        return {"success": True, "data": None}
    return {"success": True, "data": sub.to_dict()}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3002)
