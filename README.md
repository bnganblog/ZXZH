# 知行智汇平台

南京幕燕滨江研学管理系统 — 集资源浏览、任务卡生成、闯关答题、AI问答、后台管理于一体的综合实践教育平台。

## 技术栈

- **后端：** Node.js + Express + sql.js (SQLite)
- **前端：** EJS 模板 + Tailwind CSS (CDN) + 原生 JS
- **数据库：** SQLite (sql.js)，文件 `database/zxzh.db`

## 功能模块

| 模块 | 说明 |
|------|------|
| 资源浏览 | 按学段、大单元筛选研学资源，支持上传和评论 |
| 研学任务卡 | 根据学段、地点、时长筛选点位，生成任务卡 |
| 大单元闯关 | 三个模块答题，支持通关率、年级分级、成绩统计 |
| 定制化练习 | 自由筛选学段、知识点、时长，随机组卷练习 |
| 提问信箱 | 任意用户提问和回答，教师回答置顶 |
| AI问答 | 基于自定义API的AI研学助手对话 |
| 后台管理 | 用户管理、资源管理、问答管理、AI配置、数据统计 |

## 快速开始

```bash
# 安装依赖
npm install

# 启动服务
npm start

# 访问 http://localhost:3000
```

## 测试账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 学生 | student1 | test123 |
| 教师 | teacher1 | test123 |
| 管理员 | admin | admin123 |

## 项目结构

```
├── server.js              # 主服务器（路由、中间件、API）
├── database/
│   └── db.js              # 数据库初始化、表结构、辅助函数
├── views/
│   ├── admin/             # 后台管理页面
│   ├── quiz/              # 闯关答题、定制练习
│   ├── teacher/           # 教师端（出题、统计）
│   ├── student/           # 学生端
│   ├── questions/         # 提问信箱
│   ├── resources/         # 资源浏览
│   ├── tasks/             # 任务卡
│   └── partials/          # 公共头部、底部
├── public/                # 静态资源
├── package.json
└── Dockerfile
```

## 部署

```bash
# Docker 部署
docker-compose up -d

# PM2 部署
npm install -g pm2
pm2 start ecosystem.config.js
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 3000 | 服务端口 |

## License

MIT
