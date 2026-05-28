#!/bin/bash
# 知行智汇平台 - Docker 部署脚本
# 使用方法: bash deploy.sh

set -e

echo "========================================="
echo "  知行智汇平台 Docker 部署"
echo "========================================="

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装，请先安装 Docker"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose 未安装，请先安装 Docker Compose"
    exit 1
fi

# 创建必要目录
echo "📁 创建目录..."
mkdir -p database
mkdir -p public/uploads/images
mkdir -p public/uploads/resources

# 停止旧容器
echo "🛑 停止旧容器..."
docker-compose down 2>/dev/null || docker compose down 2>/dev/null || true

# 构建并启动
echo "🔨 构建镜像..."
docker-compose build --no-cache 2>/dev/null || docker compose build --no-cache

echo "🚀 启动容器..."
docker-compose up -d 2>/dev/null || docker compose up -d

# 等待启动
echo "⏳ 等待服务启动..."
sleep 5

# 检查状态
if docker-compose ps 2>/dev/null | grep -q "Up" || docker compose ps 2>/dev/null | grep -q "Up"; then
    echo ""
    echo "========================================="
    echo "  ✅ 部署成功！"
    echo "========================================="
    echo ""
    echo "  访问地址: http://localhost:3000"
    echo "  或通过 Nginx: http://localhost:80"
    echo ""
    echo "  测试账号:"
    echo "  学生: student1 / test123"
    echo "  教师: teacher1 / test123"
    echo ""
    echo "  管理命令:"
    echo "  查看日志: docker-compose logs -f"
    echo "  停止服务: docker-compose down"
    echo "  重启服务: docker-compose restart"
    echo "========================================="
else
    echo "❌ 启动失败，请检查日志: docker-compose logs"
    exit 1
fi
