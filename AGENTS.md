# 知行智汇平台 - 项目上下文

## 项目概述
知行智汇平台 - 南京幕燕滨江研学管理系统，Node.js/Express + EJS + Tailwind CSS + SQLite (sql.js) 技术栈。

## 用户偏好
- 偏好 Element UI (Vue 2) 和 Java/Spring Boot，但本项目选择混合方案：在现有 Node.js 平台上添加管理员后台功能
- 使用简体中文交互
- admin 账号设为 superadmin 角色
- 后台管理系统，涉及管理员后台和仪表盘功能
- 移动端优先响应式设计（修复移动端布局时保持桌面端不变）
- 简洁、行动导向的回复

## 技术栈
- 后端：Node.js + Express + sql.js (SQLite) + bcryptjs + express-session
- 前端：EJS 模板 + Tailwind CSS (CDN) + 原生 JS
- 数据库：SQLite (sql.js)，文件路径 `database/zxzh.db`
- 端口：3000

## 关键文件
- `server.js` - 主服务器文件，所有路由、中间件、API
- `database/db.js` - 数据库初始化、queryOne/queryAll/run 辅助函数
- `views/admin/_header.ejs` - 后台布局头部（侧边栏+顶栏）
- `views/admin/_footer.ejs` - 后台布局底部（含侧边栏切换JS）
- `views/admin/login.ejs` - 管理员登录页
- `views/admin/dashboard.ejs` - 仪表板（使用 `stats` 和 `activities` 变量）
- `views/admin/users.ejs` - 用户管理
- `views/admin/resources.ejs` - 资源管理
- `views/admin/questions.ejs` - 问答管理
- `views/admin/stats.ejs` - 数据统计（使用单个 `stats` 对象）
- `views/partials/header.ejs` - 前台导航（含管理员入口）
- `package.json` - 依赖：express, express-session, sql.js, multer, bcryptjs, ejs

## 测试账号
- 学生：student1 / test123
- 教师：teacher1 / test123
- 管理员：admin / admin123 (role: superadmin)

## 已完成的修改
1. 添加管理员角色和中间件（requireAdmin, requireAdminLogin, isAdminRole）
2. 创建管理员页面：登录、仪表板、用户管理、资源管理、问答管理、数据统计
3. 添加管理员路由（GET页面 + POST操作 + PUT/DELETE API路由）
4. 设置 admin 为 superadmin 角色
5. 修复问题删除bug（添加 DELETE /admin/api/questions/:id 路由）
6. 修复仪表板数据bug（变量名重命名匹配前端）
7. 修复用户/资源管理数据映射（camelCase字段名）
8. 修复统计页面数据bug（后端传递合并的 stats 对象，字段名与前端模板匹配）
9. 移动端后台侧边栏折叠功能

## 移动端侧边栏实现方案
- CSS媒体查询控制：`@media (max-width: 767px)` 侧边栏 fixed + translateX(-100%) 隐藏
- `@media (min-width: 768px)` 侧边栏 sticky 正常显示，桌面端不受影响
- JS使用 `sidebar-open` CSS类切换显示/隐藏
- 遮罩层 `.sidebar-overlay` 仅移动端显示
- 汉堡按钮：`md:hidden` 仅移动端显示
- 侧边栏内关闭按钮：`md:hidden` 仅移动端显示

## 统计页面变量映射
后端传递单个 `stats` 对象，字段：
- userTotal, studentTotal, teacherTotal, newToday, newWeek, activeToday
- resourceTotal, resourcePublic, resourceTeacher, resourcePrivate, resourceNewToday
- questionTotal, questionAnswered, questionUnanswered, answerRate
- quizTotalAttempts, quizCorrect, quizAccuracy
- quizByLevel: 数组，每项 { name, attempts, correct, rate }

## 数据库表
- users (id, username, password, role, real_name, grade_level, class_name, created_at)
- resources (id, title, content, images, unit_area, unit_level, point_name, author_id, author_name, is_public, created_at)
- questions (id, author_id, author_name, author_role, content, unit_area, is_answered, created_at)
- answers (id, question_id, author_id, author_name, author_role, content, created_at)
- quiz_questions, quiz_attempts, quiz_modules, wrong_questions, study_points

## 注意事项
- sql.js 是纯 JS 的 SQLite，不使用 better-sqlite3
- 修改 server.js 后需要重启服务器才能生效
- 旧 node 进程可能占用端口，需先 taskkill //F //IM node.exe
- EJS 模板中避免嵌套 include 时的变量冲突
- 数据库修改后 db.js 的 saveDatabase() 会自动保存
