# 知行智汇平台 - 技术规格说明书

## 1. 项目概述

**项目名称**: 知行智汇平台
**项目类型**: 教育研学管理Web平台
**核心功能**: 南京幕燕滨江研学资源的查询、上传、筛选、任务生成及互动问答
**目标用户**: 高中生（资源贡献者）、中小学教师/家长（资源使用者）、中小学生（学习参与者）

---

## 2. 系统架构

### 2.1 技术栈
- **前端**: HTML5 + Tailwind CSS (CDN) + Vanilla JavaScript
- **后端**: Node.js + Express.js
- **数据库**: SQLite (开发/测试) / MySQL (生产)
- **文件存储**: 本地文件系统 (开发) / 阿里云OSS (生产)
- **会话管理**: Express Session + SQLite

### 2.2 目录结构
```
zxzh/
├── server.js                 # 主服务器入口
├── package.json              # 依赖配置
├── database/
│   └── zxzh.db              # SQLite数据库
├── uploads/                  # 上传文件目录
│   ├── images/              # 图片存储
│   └── resources/           # 研学资源
├── public/                   # 静态资源
│   ├── css/
│   ├── js/
│   └── assets/
├── routes/                   # 路由模块
│   ├── auth.js              # 认证路由
│   ├── resources.js         # 资源路由
│   ├── tasks.js             # 任务路由
│   └── quiz.js              # 问答路由
├── models/                   # 数据模型
│   └── db.js               # 数据库初始化
└── views/                    # 页面模板 (EJS)
    ├── index.ejs
    ├── login.ejs
    ├── register.ejs
    ├── student/
    ├── teacher/
    └── shared/
```

---

## 3. 数据库设计

### 3.1 用户表 (users)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| username | TEXT | 用户名 |
| password | TEXT | 密码(加密) |
| role | TEXT | student/teacher |
| grade_level | TEXT | 年级(教师填写) |
| created_at | DATETIME | 注册时间 |

### 3.2 研学资源表 (resources)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| title | TEXT | 资源标题 |
| content | TEXT | 文字内容 |
| images | TEXT | 图片路径(JSON数组) |
| unit_area | TEXT | 大单元: 幕府山/燕子矶/八卦洲 |
| unit_level | TEXT | 层次: 破坏与修复/干预与复苏/转型与振兴 |
| point_name | TEXT | 点位名称 |
| author_id | INTEGER | 作者ID |
| is_public | INTEGER | 0私密/1公开/2教师发布 |
| created_at | DATETIME | 上传时间 |

### 3.3 研学点位表 (study_points)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| name | TEXT | 点位名称 |
| unit_area | TEXT | 所属区域 |
| unit_level | TEXT | 大单元层次 |
| description | TEXT | 点位简介 |
| safety_level | TEXT | A/B/C |
| duration | TEXT | 1课时/2课时 |
| grade_levels | TEXT | 适用年级(JSON数组) |
| tasks | TEXT | 任务清单(JSON数组) |
| safety_tips | TEXT | 安全提示 |
| video_links | TEXT | 视频链接(JSON数组) |

### 3.4 问答题目表 (quiz_questions)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| unit_level | TEXT | 所属层次 |
| question_type | TEXT | choice/judge/fill/essay |
| question | TEXT | 题目内容 |
| options | TEXT | 选项(JSON,选择题/判断题用) |
| answer | TEXT | 答案 |
| explanation | TEXT | 解析 |
| difficulty | INTEGER | 难度1-3 |
| time_limit | INTEGER | 单题限时(秒) |

### 3.4.1 错题库表 (wrong_questions)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| user_id | INTEGER | 用户ID |
| question_id | INTEGER | 原题目ID |
| user_answer | TEXT | 错误答案 |
| unit_level | TEXT | 所属单元 |
| question_type | TEXT | 题目类型 |
| question | TEXT | 题目内容 |
| correct_answer | TEXT | 正确答案 |
| explanation | TEXT | 解析 |
| difficulty | INTEGER | 难度 |
| added_at | DATETIME | 加入时间 |

### 3.5 用户答题记录表 (quiz_attempts)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| user_id | INTEGER | 用户ID |
| question_id | INTEGER | 题目ID |
| user_answer | TEXT | 用户答案 |
| is_correct | INTEGER | 是否正确 |
| attempted_at | DATETIME | 答题时间 |

### 3.6 提问信箱表 (questions)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| author_id | INTEGER | 提问者ID |
| author_name | TEXT | 提问者姓名 |
| content | TEXT | 问题内容 |
| is_answered | INTEGER | 是否已回答 |
| answer | TEXT | 回答内容 |
| answered_by | INTEGER | 回答者ID |
| created_at | DATETIME | 提问时间 |

---

## 4. 功能模块详细设计

### 4.1 模块一：资源查询与共建

#### 4.1.1 学生上传资源
- 支持上传多张图片(≤5张，每张≤5MB)
- 支持文字描述(≤2000字)
- 可选择私密/公开/教师发布
- 上传后自动关联点位和单元

#### 4.1.2 资源浏览
- 三个大单元Tab导航
- 每个单元下按点位分类展示
- 公开资源对所有用户可见
- 教师发布资源有特殊标识

### 4.2 模块二：点位选择与任务定制

#### 4.2.1 多维标签筛选
| 筛选维度 | 选项 |
|---------|------|
| 学段 | 小学1-3年级、4-6年级、初中、高中 |
| 大单元层次 | 破坏与修复、干预与复苏、转型与振兴 |
| 所需时长 | 1课时、2课时 |
| 安全等级 | A级、B级、C级 |

#### 4.2.2 研学任务卡生成
自动生成包含以下内容的任务卡:
- 点位简介
- 必做任务清单(3-5项)
- 安全提示
- 配套资源链接
- 相关视频(来自高中生上传)
- 支持打印

### 4.3 模块三：互动问答与迁移挑战

#### 4.3.1 大单元闯关
- 三个层次对应三个独立关卡
- 每关包含四种题型：
  - **选择题**: 单选题，点击选项后提交
  - **判断题**: 选择对/错后提交
  - **填空题**: 输入答案后提交
  - **简答题**: 简述要点后提交
- 用户自由选择进入任意板块答题
- 答题前显示答题说明（知识点、题型数量、建议时长）
- **逐题提交机制**:
  - 每道题提交后立即显示对错和解析
  - 提交后无法修改答案
  - 错题自动加入错题库
- **计时机制**:
  - 显示总剩余时间和单题剩余时间
  - 单题超时自动判定为错
  - 支持提前交卷
- 答题进度可视化（圆点指示器）
- 完成后显示正确率和答题统计

#### 4.3.2 错题库
- 收录所有板块的错题
- 支持多维度筛选：
  - 按单元筛选（破坏与修复/干预与复苏/转型与振兴）
  - 按题型筛选（选择题/判断题/填空题/简答题）
  - 按难度筛选（简单/中等/困难）
- 每道错题显示：
  - 题型标签
  - 所属模块标签
  - 难度标识
  - 加入时间
  - 正确答案与用户答案对比
  - 解析说明
- 训练功能：可点击错题进行针对性训练
- 移除功能：答对后可自行决定是否移除

#### 4.3.3 提问信箱
- 所有用户均可提问（登录用户显示身份标签）
- 所有用户均可回答
- 回答结果带有身份标签（教师/学生）
- **教师回答置顶显示**，便于提问者辨别权威答案
- 问题公开可见，形成跨学段学习共同体

---

## 5. 页面设计

### 5.1 页面列表
1. **首页** - 平台介绍、快捷入口
2. **登录/注册** - 用户认证
3. **学生端首页** - 资源上传入口、我的资源
4. **教师端首页** - 任务卡生成入口、班级管理
5. **资源浏览页** - 教师资源与学生资源分开展示
6. **资源详情页** - 资源详细内容
7. **任务卡生成页** - 筛选并生成任务卡
8. **闯关答题首页** - 板块选择、题型说明、答题入口
9. **闯关答题页** - 逐题答题、计时器、进度显示
10. **错题库页** - 错题管理、筛选、训练
11. **提问信箱页** - 跨学段交流、教师回答置顶

### 5.2 设计风格
- 主色调: #1E3A5F (深蓝色 - 学术、专业)
- 辅助色: #2E7D32 (绿色 - 生态、研学)
- 强调色: #FF6F00 (橙色 - 活力、互动)
- 背景色: #F5F7FA (浅灰白)
- 字体: "Microsoft YaHei", "PingFang SC", sans-serif

---

## 6. 用户权限

| 功能 | 游客 | 学生 | 教师 |
|------|------|------|------|
| 浏览公开资源 | ✓ | ✓ | ✓ |
| 浏览教师资源 | ✓ | ✓ | ✓ |
| 上传资源 | ✗ | ✓ | ✓ |
| 删除自己的资源 | ✗ | ✓ | ✓ |
| 生成任务卡 | ✗ | ✓ | ✓ |
| 参与闯关 | ✗ | ✓ | ✓ |
| 提问/回答 | ✗ | ✓ | ✓ |
| 查看班级答题统计 | ✗ | ✗ | ✓ |
| 发布教师资源 | ✗ | ✗ | ✓ |

---

## 7. 发布流程指南

### 7.1 开发阶段
1. 本地开发测试 (localhost)
2. 功能完整性和安全性自检

### 7.2 部署准备
1. 购买域名并备案
2. 选择云服务器 (阿里云/腾讯云/华为云)
3. 安装Node.js运行环境
4. 配置MySQL数据库
5. 配置对象存储OSS

### 7.3 生产部署
1. 代码上传 (Git/SFTP)
2. 安装依赖: `npm install`
3. 配置环境变量
4. 初始化数据库
5. 配置Nginx反向代理
6. 配置SSL证书 (HTTPS)
7. 启动服务: `pm2 start server.js`

### 7.4 上线后维护
1. 定期数据备份
2. 监控系统运行状态
3. 及时更新安全补丁
4. 用户反馈处理

---

## 8. 测试数据

### 8.1 研学点位测试数据
```javascript
[
  {
    name: "幕府山破坏与修复展示区",
    unit_area: "幕府山",
    unit_level: "破坏与修复",
    safety_level: "A",
    duration: "1课时",
    grade_levels: ["4-6年级", "初中", "高中"]
  },
  // ... 更多点位
]
```

### 8.2 测试用户
- 学生: student1/test123, student2/test123
- 教师: teacher1/test123

---

## 9. 后续扩展建议

1. **视频支持**: 集成视频播放功能
2. **地图集成**: 展示点位地理分布
3. **数据分析**: 统计学习效果
4. **微信小程序**: 开发移动端版本
5. **教师管理后台**: 使用AdminLTE框架管理研学数据
6. **学习报告生成**: 自动生成学生学习报告
