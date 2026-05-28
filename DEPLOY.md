# 知行智汇平台 - Docker 部署指南

## 方式一：直接部署（推荐）

### 1. 上传源码到服务器

```bash
# 在本地打包（Windows PowerShell）
tar -czf zxzh-deploy.tar.gz -C C:\Users\lhh\Desktop zxzh --exclude=node_modules --exclude=.git

# 上传到服务器（替换为你的服务器IP）
scp zxzh-deploy.tar.gz root@your-server-ip:/opt/
```

### 2. 在服务器上解压并部署

```bash
# SSH 登录服务器
ssh root@your-server-ip

# 解压
cd /opt
tar -xzf zxzh-deploy.tar.gz
cd zxzh

# 一键部署
chmod +x deploy.sh
bash deploy.sh
```

### 3. 访问

- 直接访问: `http://your-server-ip:3000`
- 通过 Nginx: `http://your-server-ip:80`

---

## 方式二：使用 Dockerfile 手动构建

```bash
# 构建镜像
docker build -t zxzh-platform .

# 运行容器
docker run -d \
  --name zxzh-app \
  --restart always \
  -p 3000:3000 \
  -v $(pwd)/database:/app/database \
  -v $(pwd)/public/uploads:/app/public/uploads \
  zxzh-platform
```

---

## 方式三：Docker Compose（含 Nginx）

```bash
# 启动完整服务
docker-compose up -d --build

# 仅启动应用（不含 Nginx）
docker-compose up -d --build app
```

---

## 管理命令

| 命令 | 说明 |
|------|------|
| `docker-compose logs -f` | 查看实时日志 |
| `docker-compose down` | 停止所有服务 |
| `docker-compose restart` | 重启所有服务 |
| `docker-compose ps` | 查看服务状态 |
| `docker-compose up -d --build` | 重新构建并启动 |

---

## 测试账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 学生 | student1 | test123 |
| 学生 | student2 | test123 |
| 教师 | teacher1 | test123 |

---

## 注意事项

1. **数据持久化**: 数据库和上传文件通过 volume 挂载，容器重启不会丢失
2. **防火墙**: 确保服务器开放 3000 或 80 端口
3. **HTTPS**: 如需 HTTPS，请在 nginx.conf 中启用 SSL 配置
