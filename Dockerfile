# 使用 Node.js 20 轻量级镜像
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 先复制 package.json 和 package-lock.json，利用 Docker 缓存层
COPY package*.json ./

# 安装依赖
RUN npm install --production

# 复制项目文件
COPY . .

# 创建上传目录并设置权限
RUN mkdir -p public/uploads/images public/uploads/resources && \
    chmod -R 755 public/uploads

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["node", "server.js"]
