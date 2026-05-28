const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

let db = null;
const dbPath = path.join(__dirname, '..', 'database', 'zxzh.db');

// 初始化数据库
async function initDatabase() {
    const SQL = await initSqlJs();

    // 尝试加载现有数据库
    try {
        if (fs.existsSync(dbPath)) {
            const fileBuffer = fs.readFileSync(dbPath);
            db = new SQL.Database(fileBuffer);
            console.log('已加载现有数据库');
        } else {
            db = new SQL.Database();
            console.log('创建新数据库');
        }
    } catch (err) {
        db = new SQL.Database();
        console.log('数据库初始化（新建）');
    }

    // 创建表
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'student',
            real_name TEXT,
            grade_level TEXT,
            class_name TEXT,
            login_ip TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 添加login_ip字段（如果不存在）
    try {
        db.run(`ALTER TABLE users ADD COLUMN login_ip TEXT`);
    } catch (e) {
        // 字段已存在，忽略错误
    }

    db.run(`
        CREATE TABLE IF NOT EXISTS resources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT,
            images TEXT,
            unit_area TEXT NOT NULL,
            unit_level TEXT NOT NULL,
            point_name TEXT,
            author_id INTEGER,
            author_name TEXT,
            is_public INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (author_id) REFERENCES users(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS study_points (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            unit_area TEXT NOT NULL,
            unit_level TEXT NOT NULL,
            description TEXT,
            safety_level TEXT DEFAULT 'A',
            duration TEXT DEFAULT '1课时',
            grade_levels TEXT,
            tasks TEXT,
            safety_tips TEXT,
            video_links TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS quiz_modules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            unit_level TEXT NOT NULL UNIQUE,
            total_time INTEGER DEFAULT 180,
            pass_rate INTEGER DEFAULT 60,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 添加pass_rate字段（如果不存在）
    try {
        db.run(`ALTER TABLE quiz_modules ADD COLUMN pass_rate INTEGER DEFAULT 60`);
    } catch (e) {}

    db.run(`
        CREATE TABLE IF NOT EXISTS quiz_questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            unit_level TEXT NOT NULL,
            question_type TEXT NOT NULL,
            question TEXT NOT NULL,
            options TEXT,
            answer TEXT NOT NULL,
            explanation TEXT,
            difficulty INTEGER DEFAULT 1,
            time_limit INTEGER DEFAULT 15,
            grade_level TEXT DEFAULT '高中',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 添加grade_level字段（如果不存在）
    try {
        db.run(`ALTER TABLE quiz_questions ADD COLUMN grade_level TEXT DEFAULT '高中'`);
    } catch (e) {}

    db.run(`
        CREATE TABLE IF NOT EXISTS quiz_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            question_id INTEGER,
            user_answer TEXT,
            is_correct INTEGER DEFAULT 0,
            attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (question_id) REFERENCES quiz_questions(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS wrong_questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            question_id INTEGER,
            user_answer TEXT,
            unit_level TEXT,
            question_type TEXT,
            question TEXT,
            correct_answer TEXT,
            explanation TEXT,
            difficulty INTEGER,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (question_id) REFERENCES quiz_questions(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            author_id INTEGER,
            author_name TEXT,
            author_role TEXT,
            content TEXT NOT NULL,
            unit_area TEXT,
            is_answered INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (author_id) REFERENCES users(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question_id INTEGER,
            author_id INTEGER,
            author_name TEXT,
            author_role TEXT,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (question_id) REFERENCES questions(id),
            FOREIGN KEY (author_id) REFERENCES users(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS resource_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_id INTEGER NOT NULL,
            author_id INTEGER,
            author_name TEXT,
            author_role TEXT,
            content TEXT NOT NULL,
            reply_to_id INTEGER,
            reply_to_content TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (resource_id) REFERENCES resources(id),
            FOREIGN KEY (author_id) REFERENCES users(id)
        )
    `);

    // 添加reply_to_id和reply_to_content字段（如果不存在）
    try {
        db.run(`ALTER TABLE resource_comments ADD COLUMN reply_to_id INTEGER`);
    } catch (e) {}
    try {
        db.run(`ALTER TABLE resource_comments ADD COLUMN reply_to_content TEXT`);
    } catch (e) {}

    // AI配置表
    db.run(`
        CREATE TABLE IF NOT EXISTS ai_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            api_url TEXT DEFAULT '',
            api_key TEXT DEFAULT '',
            model_name TEXT DEFAULT '',
            system_prompt TEXT DEFAULT '你是知行智汇平台的AI助手，专注于南京幕燕滨江研学相关的知识问答。请用简洁友好的方式回答用户问题。',
            temperature REAL DEFAULT 0.7,
            max_tokens INTEGER DEFAULT 1024,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 插入测试数据
    insertTestData();

    // 保存数据库
    saveDatabase();

    console.log('数据库表初始化完成');
    return db;
}

function saveDatabase() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    }
}

// 辅助函数：将结果转换为对象数组
function queryAll(sql, params = []) {
    const stmt = db.prepare(sql);
    if (params.length > 0) {
        stmt.bind(params);
    }
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

function queryOne(sql, params = []) {
    const results = queryAll(sql, params);
    return results.length > 0 ? results[0] : null;
}

function run(sql, params = []) {
    db.run(sql, params);
    saveDatabase();
    return { changes: db.getRowsModified() };
}

// 插入测试数据
function insertTestData() {
    const testUsers = [
        { username: 'student1', password: 'test123', role: 'student', real_name: '王小明', grade_level: '高一' },
        { username: 'student2', password: 'test123', role: 'student', real_name: '李小红', grade_level: '高二' },
        { username: 'teacher1', password: 'test123', role: 'teacher', real_name: '张老师', grade_level: '高中' },
        { username: 'admin', password: 'admin123', role: 'admin', real_name: '系统管理员', grade_level: '管理员' }
    ];

    for (const user of testUsers) {
        const existing = queryOne('SELECT * FROM users WHERE username = ?', [user.username]);
        if (!existing) {
            const hashedPassword = bcrypt.hashSync(user.password, 10);
            run(
                'INSERT INTO users (username, password, role, real_name, grade_level) VALUES (?, ?, ?, ?, ?)',
                [user.username, hashedPassword, user.role, user.real_name, user.grade_level]
            );
        }
    }

    // 检查是否已有点位数据
    const pointCount = queryOne('SELECT COUNT(*) as count FROM study_points');
    if (pointCount.count === 0) {
        insertTestPoints();
    }

    // 检查是否已有题目数据
    const questionCount = queryOne('SELECT COUNT(*) as count FROM quiz_questions');
    if (questionCount.count === 0) {
        insertTestQuestions();
    }
}

function insertTestPoints() {
    const testPoints = [
        {
            name: '幕府山宕口修复区',
            unit_area: '幕府山',
            unit_level: '破坏与修复',
            description: '展示幕府山采矿宕口生态修复成果，实地观察植被恢复情况。',
            safety_level: 'A',
            duration: '1课时',
            grade_levels: JSON.stringify(['4-6年级', '初中', '高中']),
            tasks: JSON.stringify(['观察宕口地貌特征', '记录植被恢复种类', '拍摄修复对比照片', '完成修复认知报告']),
            safety_tips: '请勿靠近崖壁，全程跟随老师引导',
            video_links: JSON.stringify([])
        },
        {
            name: '幕府山观景台',
            unit_area: '幕府山',
            unit_level: '破坏与修复',
            description: '登高远眺长江，了解幕府山地质变迁与人类活动影响。',
            safety_level: 'A',
            duration: '1课时',
            grade_levels: JSON.stringify(['小学4-6年级', '初中', '高中']),
            tasks: JSON.stringify(['绘制幕府山地形图', '观察长江水文特征', '访谈游客对环境的看法']),
            safety_tips: '注意防滑，观景时请勿嬉戏打闹',
            video_links: JSON.stringify([])
        },
        {
            name: '燕子矶公园湿地',
            unit_area: '燕子矶',
            unit_level: '干预与复苏',
            description: '观察滨江湿地生态系统修复成效，了解水鸟栖息地保护。',
            safety_level: 'B',
            duration: '2课时',
            grade_levels: JSON.stringify(['初中', '高中']),
            tasks: JSON.stringify(['湿地植物识别', '水鸟观察与记录', '水质简单检测', '生态修复建议撰写']),
            safety_tips: '湿地边缘湿滑，请勿涉水，注意蚊虫叮咬',
            video_links: JSON.stringify([])
        },
        {
            name: '燕子矶码头旧址',
            unit_area: '燕子矶',
            unit_level: '干预与复苏',
            description: '了解滨江工业遗址转型为生态公园的历程。',
            safety_level: 'A',
            duration: '1课时',
            grade_levels: JSON.stringify(['4-6年级', '初中', '高中']),
            tasks: JSON.stringify(['对比新旧照片', '采访晨练居民', '绘制转型时间轴']),
            safety_tips: '旧码头区域请沿规定路线参观',
            video_links: JSON.stringify([])
        },
        {
            name: '八卦洲农业示范园',
            unit_area: '八卦洲',
            unit_level: '转型与振兴',
            description: '了解长江洲岛从传统农业向生态农业转型的发展模式。',
            safety_level: 'A',
            duration: '2课时',
            grade_levels: JSON.stringify(['小学4-6年级', '初中', '高中']),
            tasks: JSON.stringify(['参观现代农业技术', '体验农事活动', '对比传统与现代农业', '探讨乡村振兴策略']),
            safety_tips: '农业园区内请勿随意采摘，跟随指导员活动',
            video_links: JSON.stringify([])
        },
        {
            name: '八卦洲湿地保护区',
            unit_area: '八卦洲',
            unit_level: '转型与振兴',
            description: '探索长江洲岛湿地生态系统保护与可持续发展的平衡。',
            safety_level: 'B',
            duration: '2课时',
            grade_levels: JSON.stringify(['初中', '高中']),
            tasks: JSON.stringify(['湿地生态系统调查', '物种多样性记录', '生态保护访谈', '提出保护建议']),
            safety_tips: '保护区核心区域禁止进入，注意防晒补水',
            video_links: JSON.stringify([])
        }
    ];

    for (const point of testPoints) {
        run(
            `INSERT INTO study_points (name, unit_area, unit_level, description, safety_level, duration, grade_levels, tasks, safety_tips, video_links)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [point.name, point.unit_area, point.unit_level, point.description,
             point.safety_level, point.duration, point.grade_levels, point.tasks,
             point.safety_tips, point.video_links]
        );
    }
    console.log('测试点位数据已插入');
}

function insertTestModules() {
    const modules = [
        { unit_level: '破坏与修复', total_time: 180, description: '了解人类活动对自然的影响与修复技术' },
        { unit_level: '干预与复苏', total_time: 180, description: '理解城市生态修复的干预策略与实践' },
        { unit_level: '转型与振兴', total_time: 180, description: '探索可持续发展的振兴之路' }
    ];
    
    for (const m of modules) {
        run(
            `INSERT OR IGNORE INTO quiz_modules (unit_level, total_time, description)
             VALUES (?, ?, ?)`,
            [m.unit_level, m.total_time, m.description]
        );
    }
    console.log('测试模块数据已插入');
}

function insertTestQuestions() {
    insertTestModules();
    const testQuestions = [
        // 破坏与修复 - 选择题
        {
            unit_level: '破坏与修复',
            question_type: 'choice',
            question: '幕府山曾经的主要人类活动是什么？',
            options: JSON.stringify(['A. 农业耕种', 'B. 采矿宕口', 'C. 渔业养殖', 'D. 工业生产']),
            answer: 'B',
            explanation: '幕府山历史上存在大量采矿宕口，造成山体破坏，后经生态修复治理。',
            difficulty: 1,
            time_limit: 15
        },
        {
            unit_level: '破坏与修复',
            question_type: 'choice',
            question: '生态修复中常用的技术措施不包括哪一项？',
            options: JSON.stringify(['A. 陡坡绿化', 'B. 客土喷播', 'C. 开采矿石', 'D. 挡墙护坡']),
            answer: 'C',
            explanation: '开采矿石是破坏生态的行为，不是修复措施。',
            difficulty: 1,
            time_limit: 15
        },
        // 破坏与修复 - 判断题
        {
            unit_level: '破坏与修复',
            question_type: 'judge',
            question: '判断题：植被修复一定能完全恢复到原始状态。',
            options: JSON.stringify(['正确', '错误']),
            answer: '错误',
            explanation: '生态修复可以在一定程度上恢复生态功能，但很难完全恢复到原始状态。',
            difficulty: 2,
            time_limit: 10
        },
        {
            unit_level: '破坏与修复',
            question_type: 'judge',
            question: '判断题：幕府山宕口修复后可以完全消除地质灾害隐患。',
            options: JSON.stringify(['正确', '错误']),
            answer: '错误',
            explanation: '修复工程可以降低风险，但地质灾害隐患难以完全消除。',
            difficulty: 1,
            time_limit: 10
        },
        // 干预与复苏 - 选择题
        {
            unit_level: '干预与复苏',
            question_type: 'choice',
            question: '燕子矶滨江湿地修复的主要目的是什么？',
            options: JSON.stringify(['A. 开发房地产', 'B. 恢复生态系统', 'C. 建设工业码头', 'D. 发展旅游商业']),
            answer: 'B',
            explanation: '湿地修复旨在恢复生态系统功能和生物多样性。',
            difficulty: 1,
            time_limit: 15
        },
        {
            unit_level: '干预与复苏',
            question_type: 'choice',
            question: '以下哪种生物最可能出现在修复后的滨江湿地？',
            options: JSON.stringify(['A. 骆驼', 'B. 白鹭', 'C. 秃鹫', 'D. 老虎']),
            answer: 'B',
            explanation: '白鹭是湿地生态系统的指示物种。',
            difficulty: 1,
            time_limit: 15
        },
        // 干预与复苏 - 判断题
        {
            unit_level: '干预与复苏',
            question_type: 'judge',
            question: '判断题：城市滨江空间的干预修复只需考虑生态因素。',
            options: JSON.stringify(['正确', '错误']),
            answer: '错误',
            explanation: '城市滨江空间修复需要综合考虑生态、景观、游憩、防洪等多种因素。',
            difficulty: 2,
            time_limit: 10
        },
        {
            unit_level: '干预与复苏',
            question_type: 'judge',
            question: '判断题：燕子矶湿地修复中不需要考虑市民游憩需求。',
            options: JSON.stringify(['正确', '错误']),
            answer: '错误',
            explanation: '城市湿地修复应兼顾生态保护与市民游憩需求。',
            difficulty: 1,
            time_limit: 10
        },
        // 转型与振兴 - 选择题
        {
            unit_level: '转型与振兴',
            question_type: 'choice',
            question: '八卦洲农业转型的方向是什么？',
            options: JSON.stringify(['A. 工业化', 'B. 城市化', 'C. 生态农业', 'D. 商业开发']),
            answer: 'C',
            explanation: '八卦洲依托长江生态岛建设，发展生态休闲农业。',
            difficulty: 1,
            time_limit: 15
        },
        {
            unit_level: '转型与振兴',
            question_type: 'choice',
            question: '乡村振兴战略不包括以下哪项内容？',
            options: JSON.stringify(['A. 产业兴旺', 'B. 生态宜居', 'C. 大规模工业化', 'D. 生活富裕']),
            answer: 'C',
            explanation: '乡村振兴强调绿色发展，不是大规模工业化。',
            difficulty: 1,
            time_limit: 15
        },
        // 转型与振兴 - 判断题
        {
            unit_level: '转型与振兴',
            question_type: 'judge',
            question: '判断题：生态保护与经济发展存在不可调和的矛盾。',
            options: JSON.stringify(['正确', '错误']),
            answer: '错误',
            explanation: '生态保护与经济发展可以协调共赢，实现可持续发展。',
            difficulty: 2,
            time_limit: 10
        },
        {
            unit_level: '转型与振兴',
            question_type: 'judge',
            question: '判断题：八卦洲转型发展不需要考虑长江生态保护。',
            options: JSON.stringify(['正确', '错误']),
            answer: '错误',
            explanation: '八卦洲作为长江洲岛，生态保护是转型发展的前提。',
            difficulty: 1,
            time_limit: 10
        }
    ];

    for (const q of testQuestions) {
        run(
            `INSERT INTO quiz_questions (unit_level, question_type, question, options, answer, explanation, difficulty, time_limit, grade_level)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [q.unit_level, q.question_type, q.question, q.options, q.answer, q.explanation, q.difficulty, q.time_limit || 15, q.grade_level || '高中']
        );
    }
    console.log('测试题目数据已插入');
}

module.exports = {
    initDatabase,
    queryAll,
    queryOne,
    run,
    saveDatabase,
    getDb: () => db
};
