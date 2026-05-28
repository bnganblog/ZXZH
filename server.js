const express = require('express');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const svgCaptcha = require('svg-captcha');
const { initDatabase, queryAll, queryOne, run, saveDatabase } = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件配置
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session配置
app.use(session({
    secret: 'zxzh-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// 文件上传配置
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === 'images') {
            cb(null, path.join(__dirname, 'public/uploads/images'));
        } else {
            cb(null, path.join(__dirname, 'public/uploads/resources'));
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        if (extname) {
            cb(null, true);
        } else {
            cb(new Error('仅支持图片文件'));
        }
    }
});

// 全局变量 - 当前登录用户
app.use((req, res, next) => {
    res.locals.currentUser = req.session.user || null;
    res.locals.isAuthenticated = !!req.session.user;
    res.locals.isAdmin = req.session.user && (req.session.user.role === 'admin' || req.session.user.role === 'superadmin');
    next();
});

const isAdminRole = (role) => role === 'admin' || role === 'superadmin';

// 管理员验证中间件
const requireAdmin = (req, res, next) => {
    if (req.session.user && isAdminRole(req.session.user.role)) {
        next();
    } else {
        req.session.returnTo = req.originalUrl;
        res.redirect('/admin/login');
    }
};

// 管理员登录验证中间件（用于登录页不重定向）
const requireAdminLogin = (req, res, next) => {
    if (req.session.user && isAdminRole(req.session.user.role)) {
        return res.redirect('/admin/dashboard');
    }
    next();
};

// 登录失败次数记录（内存存储，重启清零）
const loginAttempts = {};

// ============ 验证码API ============

// 生成验证码
app.get('/captcha', (req, res) => {
    const captcha = svgCaptcha.create({
        size: 4,
        ignoreChars: '0o1ilI',
        noise: 3,
        color: true,
        background: '#f0f0f0'
    });
    req.session.captcha = captcha.text.toLowerCase();
    res.type('svg');
    res.status(200).send(captcha.data);
});

// ============ 路由 ============

// 首页
app.get('/', (req, res) => {
    const recentResources = queryAll(`
        SELECT * FROM resources WHERE is_public = 1 OR is_public = 2 ORDER BY id DESC LIMIT 6
    `);

    const stats = {
        resources: queryOne('SELECT COUNT(*) as count FROM resources').count,
        points: queryOne('SELECT COUNT(*) as count FROM study_points').count,
        questions: queryOne('SELECT COUNT(*) as count FROM questions WHERE is_answered = 1').count
    };

    res.render('index', { recentResources, stats });
});

// ============ 认证路由 ============

// 登录页面
app.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect(req.session.user.role === 'teacher' ? '/teacher' : '/student');
    }
    const loginFailedCount = req.session.loginFailedCount || 0;
    const showCaptcha = loginFailedCount >= 5;
    res.render('login', { error: null, showCaptcha, loginFailedCount });
});

// 注册页面
app.get('/register', (req, res) => {
    if (req.session.user) {
        return res.redirect(req.session.user.role === 'teacher' ? '/teacher' : '/student');
    }
    res.render('register', { error: null });
});

// 登录处理
app.post('/login', (req, res) => {
    const { username, password, captcha } = req.body;
    const loginFailedCount = req.session.loginFailedCount || 0;
    const showCaptcha = loginFailedCount >= 5;

    // 验证码校验（失败5次后需要验证码）
    if (showCaptcha) {
        if (!captcha || !req.session.captcha || captcha.toLowerCase() !== req.session.captcha) {
            req.session.captcha = null;
            return res.render('login', { error: '验证码错误', showCaptcha: true, loginFailedCount });
        }
        req.session.captcha = null;
    }

    const user = queryOne('SELECT * FROM users WHERE username = ?', [username]);

    if (!user || !bcrypt.compareSync(password, user.password)) {
        req.session.loginFailedCount = loginFailedCount + 1;
        const newShowCaptcha = (loginFailedCount + 1) >= 5;
        return res.render('login', { error: '用户名或密码错误', showCaptcha: newShowCaptcha, loginFailedCount: loginFailedCount + 1 });
    }

    // 登录成功，清除失败次数
    req.session.loginFailedCount = 0;

    // 获取用户IP
    const loginIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;

    // 记录登录IP
    run('UPDATE users SET login_ip = ? WHERE id = ?', [loginIp, user.id]);

    req.session.user = {
        id: user.id,
        username: user.username,
        realName: user.real_name,
        role: user.role,
        gradeLevel: user.grade_level
    };

    if (user.role === 'admin' || user.role === 'superadmin') {
        return res.redirect('/admin/dashboard');
    }
    res.redirect(user.role === 'teacher' ? '/teacher' : '/student');
});

// 注册处理
app.post('/register', (req, res) => {
    const { username, password, confirmPassword, role, realName, gradeLevel, captcha } = req.body;

    // 验证码校验
    if (!captcha || !req.session.captcha || captcha.toLowerCase() !== req.session.captcha) {
        req.session.captcha = null;
        return res.render('register', { error: '验证码错误' });
    }
    req.session.captcha = null;

    if (password !== confirmPassword) {
        return res.render('register', { error: '两次密码输入不一致' });
    }

    const existingUser = queryOne('SELECT * FROM users WHERE username = ?', [username]);
    if (existingUser) {
        return res.render('register', { error: '用户名已存在' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    try {
        run(
            'INSERT INTO users (username, password, role, real_name, grade_level) VALUES (?, ?, ?, ?, ?)',
            [username, hashedPassword, role, realName, gradeLevel]
        );

        res.redirect('/login');
    } catch (err) {
        res.render('register', { error: '注册失败，请重试' });
    }
});

// 登出
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// 修改密码
app.get('/change-password', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.render('change-password', { error: null, success: null });
});

app.post('/change-password', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
        return res.render('change-password', { error: '请填写所有字段', success: null });
    }

    if (newPassword.length < 6) {
        return res.render('change-password', { error: '新密码至少6位', success: null });
    }

    if (newPassword !== confirmPassword) {
        return res.render('change-password', { error: '两次输入的新密码不一致', success: null });
    }

    const user = queryOne('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
    if (!user || !bcrypt.compareSync(currentPassword, user.password)) {
        return res.render('change-password', { error: '当前密码错误', success: null });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.session.user.id]);

    res.render('change-password', { error: null, success: '密码修改成功' });
});

// ============ 学生端路由 ============

app.get('/student', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const myResources = queryAll(`
        SELECT * FROM resources WHERE author_id = ? ORDER BY id DESC
    `, [req.session.user.id]);

    const stats = {
        myResources: myResources.length,
        totalPoints: queryOne('SELECT COUNT(*) as count FROM study_points').count,
        answeredQuestions: queryOne(`
            SELECT COUNT(*) as count FROM quiz_attempts WHERE user_id = ? AND is_correct = 1
        `, [req.session.user.id]).count
    };

    res.render('student/index', { myResources, stats });
});

// 学生上传资源页面
app.get('/student/upload', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.render('student/upload');
});

// 学生上传处理
app.post('/student/upload', upload.array('images', 5), (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const { title, content, unitArea, unitLevel, pointName, isPublic } = req.body;

    const images = req.files ? req.files.map(f => '/uploads/images/' + f.filename) : [];

    run(
        `INSERT INTO resources (title, content, images, unit_area, unit_level, point_name, author_id, author_name, is_public)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            title,
            content,
            JSON.stringify(images),
            unitArea,
            unitLevel,
            pointName,
            req.session.user.id,
            req.session.user.realName,
            parseInt(isPublic)
        ]
    );

    res.redirect('/student');
});

// 学生资源管理
app.get('/student/resources', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const resources = queryAll(`
        SELECT * FROM resources WHERE author_id = ? ORDER BY id DESC
    `, [req.session.user.id]);

    res.render('student/resources', { resources });
});

// 删除学生资源
app.post('/student/resources/delete/:id', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const resource = queryOne('SELECT * FROM resources WHERE id = ? AND author_id = ?',
        [req.params.id, req.session.user.id]);

    if (resource) {
        run('DELETE FROM resources WHERE id = ?', [req.params.id]);
    }

    res.redirect('/student/resources');
});

// ============ 教师端路由 ============

// 更新学生姓名
app.post('/student/update-name', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const { realName } = req.body;

    if (!realName || realName.trim().length < 1) {
        return res.redirect('/student');
    }

    run('UPDATE users SET real_name = ? WHERE id = ?', [realName.trim(), req.session.user.id]);

    req.session.user.realName = realName.trim();

    res.redirect('/student');
});

app.get('/teacher', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'teacher') {
        return res.redirect('/login');
    }

    const stats = {
        totalResources: queryOne('SELECT COUNT(*) as count FROM resources').count,
        teacherResources: queryOne('SELECT COUNT(*) as count FROM resources WHERE author_id = ?', [req.session.user.id]).count,
        totalPoints: queryOne('SELECT COUNT(*) as count FROM study_points').count,
        pendingQuestions: queryOne('SELECT COUNT(*) as count FROM questions WHERE is_answered = 0').count,
        recentQuestions: queryAll('SELECT * FROM questions ORDER BY id DESC LIMIT 5')
    };

    res.render('teacher/index', { stats });
});

// 更新教师姓名
app.post('/teacher/update-name', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'teacher') {
        return res.redirect('/login');
    }

    const { realName } = req.body;

    if (!realName || realName.trim().length < 1) {
        return res.redirect('/teacher');
    }

    run('UPDATE users SET real_name = ? WHERE id = ?', [realName.trim(), req.session.user.id]);

    req.session.user.realName = realName.trim();

    res.redirect('/teacher');
});

// 教师发布资源页面
app.get('/teacher/publish', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'teacher') {
        return res.redirect('/login');
    }
    res.render('teacher/publish');
});

// 教师发布资源处理
app.post('/teacher/publish', upload.array('images', 5), (req, res) => {
    if (!req.session.user || req.session.user.role !== 'teacher') {
        return res.redirect('/login');
    }

    const { title, content, unitArea, unitLevel, pointName } = req.body;
    const images = req.files ? req.files.map(f => '/uploads/images/' + f.filename) : [];

    run(
        `INSERT INTO resources (title, content, images, unit_area, unit_level, point_name, author_id, author_name, is_public)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 2)`,
        [
            title,
            content,
            JSON.stringify(images),
            unitArea,
            unitLevel,
            pointName,
            req.session.user.id,
            req.session.user.realName
        ]
    );

    res.redirect('/teacher');
});

// 资源编辑页面
app.get('/resources/:id/edit', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const resource = queryOne('SELECT * FROM resources WHERE id = ?', [req.params.id]);
    if (!resource) {
        return res.redirect('/resources');
    }

    // 检查权限：作者本人或管理员
    if (resource.author_id !== req.session.user.id && req.session.user.role !== 'superadmin' && req.session.user.role !== 'admin') {
        return res.redirect('/resources/' + req.params.id);
    }

    let images = [];
    try {
        images = resource.images ? JSON.parse(resource.images) : [];
    } catch (e) {
        images = [];
    }

    res.render('resource-edit', { resource, images });
});

// 资源编辑处理
app.post('/resources/:id/edit', upload.array('images', 5), (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const resource = queryOne('SELECT * FROM resources WHERE id = ?', [req.params.id]);
    if (!resource) {
        return res.redirect('/resources');
    }

    if (resource.author_id !== req.session.user.id && req.session.user.role !== 'superadmin' && req.session.user.role !== 'admin') {
        return res.redirect('/resources/' + req.params.id);
    }

    const { title, content, unitArea, unitLevel, pointName, isPublic, existingImages } = req.body;

    // 合并已有图片和新上传图片
    let images = [];
    if (existingImages) {
        try { images = JSON.parse(existingImages); } catch (e) { images = []; }
    }
    if (req.files && req.files.length > 0) {
        images = images.concat(req.files.map(f => '/uploads/images/' + f.filename));
    }

    run(
        `UPDATE resources SET title=?, content=?, images=?, unit_area=?, unit_level=?, point_name=?, is_public=? WHERE id=?`,
        [title, content, JSON.stringify(images), unitArea, unitLevel, pointName, parseInt(isPublic) || resource.is_public, req.params.id]
    );

    res.redirect('/resources/' + req.params.id);
});

// 教师资源管理
app.get('/teacher/resources', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'teacher') {
        return res.redirect('/login');
    }

    const filter = req.query.filter || '';
    let resources;
    
    if (filter === 'teacher') {
        resources = queryAll(`
            SELECT * FROM resources WHERE is_public = 2 ORDER BY id DESC
        `);
    } else {
        resources = queryAll(`
            SELECT * FROM resources WHERE author_id = ? OR is_public = 2 ORDER BY id DESC
        `, [req.session.user.id]);
    }

    res.render('teacher/resources', { resources, currentFilter: filter });
});

// 教师班级答题统计
app.get('/teacher/quiz-stats', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'teacher') {
        return res.redirect('/login');
    }

    // 统计有多少学生参与过答题（按学生维度统计）
    const studentStats = queryOne(`
        SELECT COUNT(DISTINCT user_id) as totalStudents
        FROM quiz_attempts
    `);

    // 按模块统计有多少不同的学生参与
    const moduleStats = queryAll(`
        SELECT q.unit_level,
               COUNT(DISTINCT first_attempt.user_id) as studentCount,
               SUM(CASE WHEN first_attempt.is_correct = 1 THEN 1 ELSE 0 END) as totalCorrect,
               COUNT(first_attempt.user_id) as totalAttempts
        FROM quiz_questions q
        LEFT JOIN (
            SELECT a1.user_id, a1.question_id, a1.is_correct
            FROM quiz_attempts a1
            WHERE a1.id = (
                SELECT MIN(a2.id)
                FROM quiz_attempts a2
                WHERE a2.user_id = a1.user_id AND a2.question_id = a1.question_id
            )
        ) first_attempt ON q.id = first_attempt.question_id
        WHERE q.question_type IN ('choice', 'judge')
        GROUP BY q.unit_level
    `);

    // 统计每道题有多少学生首次作答
    const quizStats = queryAll(`
        SELECT q.unit_level, q.question, q.question_type,
               COUNT(DISTINCT first_attempt.user_id) as attempts,
               SUM(CASE WHEN first_attempt.is_correct = 1 THEN 1 ELSE 0 END) as correct,
               ROUND(CAST(SUM(CASE WHEN first_attempt.is_correct = 1 THEN 1 ELSE 0 END) AS FLOAT) / COUNT(first_attempt.user_id) * 100, 1) as accuracy
        FROM quiz_questions q
        LEFT JOIN (
            SELECT a1.user_id, a1.question_id, a1.is_correct
            FROM quiz_attempts a1
            WHERE a1.id = (
                SELECT MIN(a2.id)
                FROM quiz_attempts a2
                WHERE a2.user_id = a1.user_id AND a2.question_id = a1.question_id
            )
        ) first_attempt ON q.id = first_attempt.question_id
        WHERE q.question_type IN ('choice', 'judge')
        GROUP BY q.id
        ORDER BY q.unit_level, q.id
    `);

    res.render('teacher/quiz-stats', { quizStats, totalStudents: studentStats.totalStudents, moduleStats });
});

// 教师端题目管理页面
app.get('/teacher/quiz-manage', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'teacher') {
        return res.redirect('/login');
    }

    const module = req.query.module || '破坏与修复';
    
    const questions = queryAll(`
        SELECT * FROM quiz_questions 
        WHERE unit_level = ? AND question_type IN ('choice', 'judge')
        ORDER BY id
    `, [module]);

    res.render('teacher/quiz-manage', {
        questions,
        currentModule: module,
        currentUser: req.session.user
    });
});

// 获取单个题目
app.get('/teacher/quiz/get/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'teacher') {
        return res.json({ success: false, message: '未授权' });
    }

    const question = queryOne('SELECT * FROM quiz_questions WHERE id = ?', [req.params.id]);
    
    if (question) {
        res.json(question);
    } else {
        res.json({ success: false, message: '题目不存在' });
    }
});

// 更新模块答题时间
app.post('/teacher/quiz/update-module-time', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'teacher') {
        return res.json({ success: false, message: '未授权' });
    }

    const { unit_level, total_time, pass_rate } = req.body;

    if (!unit_level || !total_time || total_time < 60) {
        return res.json({ success: false, message: '请输入有效的模块名称和时间（至少60秒）' });
    }

    try {
        run(`
            INSERT OR REPLACE INTO quiz_modules (unit_level, total_time, pass_rate)
            VALUES (?, ?, ?)
        `, [unit_level, total_time, parseInt(pass_rate) || 60]);
        
        res.json({ success: true, message: '模块设置更新成功' });
    } catch (error) {
        console.error('更新模块设置失败:', error);
        res.json({ success: false, message: '更新失败' });
    }
});

// 保存题目（添加或编辑）
app.post('/teacher/quiz/save', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'teacher') {
        return res.json({ success: false, message: '未授权' });
    }

    const { id, unit_level, question_type, question, options, answer, explanation, difficulty, time_limit, grade_level } = req.body;

    if (!question || !answer) {
        return res.json({ success: false, message: '请填写题目内容和正确答案' });
    }

    const grade = grade_level || '高中';

    try {
        if (id) {
            // 更新现有题目
            run(`
                UPDATE quiz_questions 
                SET question_type = ?, question = ?, options = ?, answer = ?, explanation = ?, difficulty = ?, time_limit = ?, grade_level = ?
                WHERE id = ?
            `, [question_type, question, options, answer, explanation, difficulty, time_limit, grade, id]);
            res.json({ success: true, message: '题目更新成功' });
        } else {
            // 添加新题目
            run(`
                INSERT INTO quiz_questions (unit_level, question_type, question, options, answer, explanation, difficulty, time_limit, grade_level)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [unit_level, question_type, question, options, answer, explanation, difficulty, time_limit, grade]);
            res.json({ success: true, message: '题目添加成功' });
        }
    } catch (error) {
        res.json({ success: false, message: '保存失败：' + error.message });
    }
});

// 删除题目
app.post('/teacher/quiz/delete/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'teacher') {
        return res.json({ success: false, message: '未授权' });
    }

    try {
        run('DELETE FROM quiz_questions WHERE id = ?', [req.params.id]);
        run('DELETE FROM quiz_attempts WHERE question_id = ?', [req.params.id]);
        run('DELETE FROM wrong_questions WHERE question_id = ?', [req.params.id]);
        res.json({ success: true, message: '题目删除成功' });
    } catch (error) {
        res.json({ success: false, message: '删除失败：' + error.message });
    }
});

// ============ 资源浏览路由 ============

// 资源浏览首页 - 按大单元分类
app.get('/resources', (req, res) => {
    const unitArea = req.query.area;

    let resources;
    if (!unitArea || unitArea === '全部') {
        resources = queryAll(`
            SELECT * FROM resources
            WHERE is_public = 1 OR is_public = 2
            ORDER BY id DESC
        `);
    } else {
        resources = queryAll(`
            SELECT * FROM resources
            WHERE unit_area = ? AND (is_public = 1 OR is_public = 2)
            ORDER BY id DESC
        `, [unitArea]);
    }

    const teacherResources = queryAll(`
        SELECT * FROM resources
        WHERE is_public = 2
        ORDER BY id DESC
    `);

    res.render('resources/index', { resources, teacherResources, currentArea: unitArea });
});

// 资源详情页
app.get('/resources/:id', (req, res) => {
    const resource = queryOne('SELECT * FROM resources WHERE id = ?', [req.params.id]);

    if (!resource) {
        return res.redirect('/resources');
    }

    if (resource.is_public === 0 && (!req.session.user || req.session.user.id !== resource.author_id)) {
        return res.redirect('/resources');
    }

    resource.images = resource.images ? JSON.parse(resource.images) : [];

    const comments = queryAll(
        'SELECT * FROM resource_comments WHERE resource_id = ? ORDER BY created_at DESC',
        [req.params.id]
    );

    res.render('resources/detail', { resource, comments, user: req.session.user || null });
});

app.post('/resources/:id/comments', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const { content, reply_to_id, reply_to_content } = req.body;
    if (!content || !content.trim()) {
        return res.redirect('/resources/' + req.params.id);
    }

    // 处理引用回复
    let replyToId = null;
    let replyToContent = null;
    if (reply_to_id) {
        const replyToComment = queryOne('SELECT * FROM resource_comments WHERE id = ?', [reply_to_id]);
        if (replyToComment) {
            replyToId = reply_to_id;
            replyToContent = replyToComment.content.substring(0, 100) + (replyToComment.content.length > 100 ? '...' : '');
        }
    }

    run(
        'INSERT INTO resource_comments (resource_id, author_id, author_name, author_role, content, reply_to_id, reply_to_content) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [req.params.id, req.session.user.id, req.session.user.realName || req.session.user.username, req.session.user.role, content.trim(), replyToId, replyToContent]
    );

    res.redirect('/resources/' + req.params.id);
});

app.post('/resources/:id/comments/:commentId/delete', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const comment = queryOne('SELECT * FROM resource_comments WHERE id = ?', [req.params.commentId]);
    if (comment && (comment.author_id === req.session.user.id || req.session.user.role === 'superadmin')) {
        run('DELETE FROM resource_comments WHERE id = ?', [req.params.commentId]);
    }

    res.redirect('/resources/' + req.params.id);
});

// ============ 任务卡路由 ============

// 任务卡生成页面
app.get('/tasks', (req, res) => {
    const { gradeLevel, unitLevel, duration, safetyLevel } = req.query;

    let query = 'SELECT * FROM study_points WHERE 1=1';
    let params = [];

    if (gradeLevel) {
        query += ' AND grade_levels LIKE ?';
        params.push(`%${gradeLevel}%`);
    }
    if (unitLevel) {
        query += ' AND unit_level = ?';
        params.push(unitLevel);
    }
    if (duration) {
        query += ' AND duration = ?';
        params.push(duration);
    }
    if (safetyLevel) {
        query += ' AND safety_level = ?';
        params.push(safetyLevel);
    }

    const points = queryAll(query, params);

    // 解析JSON字段
    points.forEach(p => {
        p.grade_levels = JSON.parse(p.grade_levels || '[]');
        p.tasks = JSON.parse(p.tasks || '[]');
        p.video_links = JSON.parse(p.video_links || '[]');
    });

    // 获取相关资源
    const pointsWithResources = points.map(point => {
        const resources = queryAll(`
            SELECT * FROM resources
            WHERE point_name = ? AND (is_public = 1 OR is_public = 2)
        `, [point.name]);
        resources.forEach(r => r.images = r.images ? JSON.parse(r.images) : []);
        return { ...point, resources };
    });

    res.render('tasks/index', { points: pointsWithResources, filters: { gradeLevel, unitLevel, duration, safetyLevel } });
});

// 任务卡详情/打印页面
app.get('/tasks/:id', (req, res) => {
    const point = queryOne('SELECT * FROM study_points WHERE id = ?', [req.params.id]);

    if (!point) {
        return res.redirect('/tasks');
    }

    point.grade_levels = JSON.parse(point.grade_levels || '[]');
    point.tasks = JSON.parse(point.tasks || '[]');
    point.video_links = JSON.parse(point.video_links || '[]');

    // 获取相关资源
    const resources = queryAll(`
        SELECT * FROM resources
        WHERE point_name = ? AND (is_public = 1 OR is_public = 2)
    `, [point.name]);

    resources.forEach(r => r.images = r.images ? JSON.parse(r.images) : []);

    res.render('tasks/detail', { point, resources });
});

// ============ 闯关答题路由 ============

// 闯关答题首页 - 板块选择
app.get('/quiz', (req, res) => {
    // 获取用户默认年级
    const gradeLevels = ['小学(1-3年级)', '小学(4-6年级)', '初中', '高中'];
    const defaultGrade = req.session.user?.gradeLevel || '高中';
    const currentGrade = req.query.grade || defaultGrade;

    // 获取各单元题目统计（按年级筛选）
    const unitLevels = ['破坏与修复', '干预与复苏', '转型与振兴'];
    const moduleStats = {};

    unitLevels.forEach(level => {
        const questions = queryAll(`
            SELECT question_type, difficulty, time_limit FROM quiz_questions WHERE unit_level = ? AND grade_level = ?
        `, [level, currentGrade]);

        // 从模块表中获取总时间（秒）和通关率
        const moduleInfo = queryOne(`
            SELECT total_time, pass_rate FROM quiz_modules WHERE unit_level = ?
        `, [level]);

        const stats = {
            total: questions.length,
            choice: questions.filter(q => q.question_type === 'choice').length,
            judge: questions.filter(q => q.question_type === 'judge').length,
            fill: questions.filter(q => q.question_type === 'fill').length,
            essay: questions.filter(q => q.question_type === 'essay').length,
            time: Math.ceil((moduleInfo?.total_time || 180) / 60),
            passRate: moduleInfo?.pass_rate || 60,
            accuracy: 0
        };

        // 如果用户已登录，计算正确率
        if (req.session.user) {
            const correctCount = queryOne(`
                SELECT COUNT(*) as count FROM quiz_attempts
                WHERE user_id = ? AND is_correct = 1
                AND question_id IN (SELECT id FROM quiz_questions WHERE unit_level = ? AND grade_level = ?)
            `, [req.session.user.id, level, currentGrade]);

            const totalCount = queryOne(`
                SELECT COUNT(DISTINCT question_id) as count FROM quiz_attempts
                WHERE user_id = ?
                AND question_id IN (SELECT id FROM quiz_questions WHERE unit_level = ? AND grade_level = ?)
            `, [req.session.user.id, level, currentGrade]);

            if (totalCount && totalCount.count > 0) {
                stats.accuracy = Math.round((correctCount.count / totalCount.count) * 100);
            }
        }

        moduleStats[level] = stats;
    });

    // 获取用户错题数量
    let wrongCount = 0;
    if (req.session.user) {
        const wrongResult = queryOne(`
            SELECT COUNT(*) as count FROM wrong_questions WHERE user_id = ?
        `, [req.session.user.id]);
        wrongCount = wrongResult ? wrongResult.count : 0;
    }

    res.render('quiz/index', {
        moduleStats,
        moduleStatsJson: JSON.stringify(moduleStats),
        wrongCount,
        gradeLevels,
        currentGrade,
        isAuthenticated: !!req.session.user,
        currentUser: req.session.user
    });
});

// 开始答题页面
app.get('/quiz/start', (req, res) => {
    const unitLevel = req.query.level || '破坏与修复';
    const gradeLevel = req.query.grade || req.session.user?.gradeLevel || '高中';

    const questions = queryAll(`
        SELECT * FROM quiz_questions WHERE unit_level = ? AND grade_level = ? AND question_type IN ('choice', 'judge') ORDER BY id
    `, [unitLevel, gradeLevel]);

    // 获取模块通关率
    const moduleInfo = queryOne('SELECT pass_rate FROM quiz_modules WHERE unit_level = ?', [unitLevel]);
    const passRate = moduleInfo?.pass_rate || 60;

    questions.forEach(q => {
        if (q.options && q.options.trim()) {
            try {
                q.options = JSON.parse(q.options);
            } catch (e) {
                q.options = [];
            }
        } else {
            if (q.question_type === 'choice') {
                q.options = ['A. 选项A', 'B. 选项B', 'C. 选项C', 'D. 选项D'];
            } else if (q.question_type === 'judge') {
                q.options = ['正确', '错误'];
            } else {
                q.options = [];
            }
        }
    });

    res.render('quiz/start', {
        unitLevel,
        gradeLevel,
        questions,
        passRate,
        isAuthenticated: !!req.session.user,
        currentUser: req.session.user
    });
});

// ============ 定制化练习路由 ============

// 定制练习筛选页
app.get('/quiz/custom', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.render('quiz/custom', {
        isAuthenticated: !!req.session.user,
        currentUser: req.session.user
    });
});

// 开始定制练习
app.post('/quiz/custom/start', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const { grade_level, unit_levels, duration, question_count } = req.body;

    // 解析筛选条件
    const grades = grade_level || '高中';
    const modules = unit_levels ? (Array.isArray(unit_levels) ? unit_levels : [unit_levels]) : ['破坏与修复', '干预与复苏', '转型与振兴'];
    const durationMinutes = parseInt(duration) || 10;
    const count = parseInt(question_count) || 10;

    // 构建查询条件
    const placeholders = modules.map(() => '?').join(',');
    const questions = queryAll(`
        SELECT * FROM quiz_questions 
        WHERE grade_level = ? AND unit_level IN (${placeholders}) AND question_type IN ('choice', 'judge')
        ORDER BY RANDOM() LIMIT ?
    `, [grades, ...modules, count]);

    // 解析选项
    questions.forEach(q => {
        if (q.options && q.options.trim()) {
            try { q.options = JSON.parse(q.options); } catch (e) { q.options = []; }
        } else {
            q.options = q.question_type === 'choice' ? ['A. 选项A', 'B. 选项B', 'C. 选项C', 'D. 选项D'] : ['正确', '错误'];
        }
    });

    // 计算总时长（各题time_limit之和）
    const totalTime = questions.reduce((sum, q) => sum + (q.time_limit || 15), 0);

    if (questions.length === 0) {
        return res.render('quiz/custom-start', {
            questions: [],
            totalTime: durationMinutes * 60,
            isAuthenticated: !!req.session.user,
            currentUser: req.session.user
        });
    }

    res.render('quiz/custom-start', {
        questions,
        totalTime,
        isAuthenticated: !!req.session.user,
        currentUser: req.session.user
    });
});

// 提交定制练习答案
app.post('/quiz/custom/submit', (req, res) => {
    if (!req.session.user) {
        return res.json({ success: false, message: '请先登录' });
    }

    const { questionId, answer } = req.body;
    const question = queryOne('SELECT * FROM quiz_questions WHERE id = ?', [questionId]);

    if (!question) {
        return res.json({ success: false, message: '题目不存在' });
    }

    const correctAnswer = question.answer || '';
    const explanation = question.explanation || '';
    const questionType = question.question_type || '';
    const unitLevelVal = question.unit_level || '';
    const questionText = question.question || '';
    const difficulty = question.difficulty || 1;

    let isCorrect = false;
    if (questionType === 'choice') {
        isCorrect = answer.trim().charAt(0).toUpperCase() === correctAnswer.trim().toUpperCase();
    } else {
        isCorrect = answer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
    }

    // 记录答题尝试（标记为练习）
    run(
        'INSERT INTO quiz_attempts (user_id, question_id, user_answer, is_correct) VALUES (?, ?, ?, ?)',
        [req.session.user.id, questionId, answer, isCorrect ? 1 : 0]
    );

    // 错题仍入库
    if (!isCorrect) {
        const existing = queryOne(
            'SELECT id FROM wrong_questions WHERE user_id = ? AND question_id = ?',
            [req.session.user.id, questionId]
        );
        if (!existing) {
            run(
                `INSERT INTO wrong_questions (user_id, question_id, user_answer, unit_level, question_type, question, correct_answer, explanation, difficulty)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [req.session.user.id, questionId, answer, unitLevelVal, questionType, questionText, correctAnswer, explanation, difficulty]
            );
        }
    }

    res.json({ success: true, isCorrect, correctAnswer, explanation });
});

// 提交答题
app.post('/quiz/submit', (req, res) => {
    if (!req.session.user) {
        return res.json({ success: false, message: '请先登录' });
    }

    const { questionId, answer, unitLevel, isTimeout } = req.body;
    const question = queryOne('SELECT * FROM quiz_questions WHERE id = ?', [questionId]);

    if (!question) {
        return res.json({ success: false, message: '题目不存在' });
    }

    // 获取答案（兼容不同的字段名格式）
    const correctAnswer = question.answer || question.ANSWER || '';
    const explanation = question.explanation || question.EXPLANATION || '';
    const questionType = question.question_type || question.QUESTION_TYPE || '';
    const unitLevelVal = question.unit_level || question.UNIT_LEVEL || '';
    const questionText = question.question || question.QUESTION || '';
    const difficulty = question.difficulty || question.DIFFICULTY || 1;

    // 判断答案是否正确（简答题需要人工评判，这里简化处理）
    let isCorrect = false;
    if (questionType === 'essay') {
        // 简答题：答案包含关键词即算正确
        const answerKeywords = answer.replace(/[，,。.、;；]/g, '').toLowerCase();
        const correctKeywords = correctAnswer.replace(/[，,。.、;；]/g, '').toLowerCase();
        isCorrect = answer.includes(correctKeywords) || correctKeywords.includes(answer);
    } else if (questionType === 'choice') {
        // 选择题：提取答案的第一个字符（如 "B. 采矿宕口" -> "B"）
        const userAnswerLetter = answer.trim().charAt(0).toUpperCase();
        const correctAnswerLetter = correctAnswer.trim().toUpperCase();
        isCorrect = userAnswerLetter === correctAnswerLetter;
    } else {
        // 判断题和填空题：直接比较
        isCorrect = answer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
    }

    // 记录答题尝试
    run(
        'INSERT INTO quiz_attempts (user_id, question_id, user_answer, is_correct) VALUES (?, ?, ?, ?)',
        [req.session.user.id, questionId, answer, isCorrect ? 1 : 0]
    );

    // 如果答错，添加到错题库
    if (!isCorrect) {
        // 检查是否已存在
        const existing = queryOne(`
            SELECT id FROM wrong_questions WHERE user_id = ? AND question_id = ?
        `, [req.session.user.id, questionId]);

        if (!existing) {
            run(
                `INSERT INTO wrong_questions (user_id, question_id, user_answer, unit_level, question_type, question, correct_answer, explanation, difficulty)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [req.session.user.id, questionId, answer, unitLevelVal, questionType,
                 questionText, correctAnswer, explanation, difficulty]
            );
        }
    }

    res.json({
        success: true,
        isCorrect,
        correctAnswer: correctAnswer,
        explanation: explanation
    });
});

// 错题库页面
app.get('/quiz/wrong', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const wrongQuestions = queryAll(`
        SELECT * FROM wrong_questions WHERE user_id = ? ORDER BY added_at DESC
    `, [req.session.user.id]);

    res.render('quiz/wrong', {
        wrongQuestions,
        isAuthenticated: true,
        currentUser: req.session.user
    });
});

// 训练 - 获取题目
app.get('/quiz/train/:id', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: '请先登录' });
    }

    const wrongQuestion = queryOne(`
        SELECT * FROM wrong_questions WHERE id = ? AND user_id = ?
    `, [req.params.id, req.session.user.id]);

    if (!wrongQuestion) {
        return res.status(404).json({ message: '题目不存在' });
    }

    res.json({
        id: wrongQuestion.question_id,
        question: wrongQuestion.question,
        options: wrongQuestion.question_type === 'choice' || wrongQuestion.question_type === 'judge'
            ? JSON.stringify(['正确', '错误']) // 简化的选项
            : null,
        question_type: wrongQuestion.question_type,
        difficulty: wrongQuestion.difficulty,
        correct_answer: wrongQuestion.correct_answer,
        explanation: wrongQuestion.explanation,
        wrongId: wrongQuestion.id
    });
});

// 训练提交答案
app.post('/quiz/train/submit', (req, res) => {
    if (!req.session.user) {
        return res.json({ success: false, message: '请先登录' });
    }

    const { questionId, answer } = req.body;
    const question = queryOne('SELECT * FROM quiz_questions WHERE id = ?', [questionId]);

    if (!question) {
        return res.json({ success: false, message: '题目不存在' });
    }

    let isCorrect = false;
    if (question.question_type === 'essay') {
        isCorrect = answer.includes(question.answer) || question.answer.includes(answer);
    } else {
        isCorrect = answer.trim().toLowerCase() === question.answer.trim().toLowerCase();
    }

    res.json({
        success: true,
        isCorrect,
        correctAnswer: question.answer,
        explanation: question.explanation
    });
});

// 移除错题
app.delete('/quiz/wrong/:id', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: '请先登录' });
    }

    run('DELETE FROM wrong_questions WHERE id = ? AND user_id = ?',
        [req.params.id, req.session.user.id]);

    res.json({ success: true });
});

// ============ 提问信箱路由 ============

// 提问信箱页面
app.get('/questions', (req, res) => {
    const unitArea = req.query.area;
    const filterAnswered = req.query.filter;

    let query = 'SELECT * FROM questions WHERE 1=1';
    let params = [];

    if (unitArea) {
        query += ' AND unit_area = ?';
        params.push(unitArea);
    }

    query += ' ORDER BY id DESC';

    const questions = queryAll(query, params);

    // 获取每个问题的回答
    questions.forEach(q => {
        q.answers = queryAll(
            'SELECT * FROM answers WHERE question_id = ? ORDER BY author_role = "teacher" DESC, id DESC',
            [q.id]
        );
        q.has_answer = q.answers.length > 0;
    });

    // 筛选已回答/待回答
    let filteredQuestions = questions;
    if (filterAnswered === 'answered') {
        filteredQuestions = questions.filter(q => q.has_answer);
    } else if (filterAnswered === 'unanswered') {
        filteredQuestions = questions.filter(q => !q.has_answer);
    }

    res.render('questions/index', { questions: filteredQuestions, currentArea: unitArea, filterAnswered });
});

// 发布问题
app.post('/questions', (req, res) => {
    const { content, unitArea } = req.body;

    let authorId = null;
    let authorName = '游客';
    let authorRole = 'guest';

    if (req.session.user) {
        authorId = req.session.user.id;
        authorName = req.session.user.realName;
        authorRole = req.session.user.role;
    }

    run(
        'INSERT INTO questions (author_id, author_name, author_role, content, unit_area) VALUES (?, ?, ?, ?, ?)',
        [authorId, authorName, authorRole, content, unitArea]
    );

    res.redirect('/questions');
});

// 回答问题 - 所有用户均可回答
app.post('/questions/:id/answer', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const { answer } = req.body;

    // 插入回答
    run(
        'INSERT INTO answers (question_id, author_id, author_name, author_role, content) VALUES (?, ?, ?, ?, ?)',
        [req.params.id, req.session.user.id, req.session.user.realName, req.session.user.role, answer]
    );

    // 更新问题状态为已回答
    run('UPDATE questions SET is_answered = 1 WHERE id = ?', [req.params.id]);

    res.redirect('/questions');
});

// ============ 管理员路由 ============

// 管理员登录页面
app.get('/admin/login', requireAdminLogin, (req, res) => {
    res.render('admin/login', { error: null });
});

// 管理员登录处理
app.post('/admin/login', requireAdminLogin, (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.render('admin/login', { error: '用户名和密码不能为空' });
    }
    
    const user = queryOne('SELECT * FROM users WHERE username = ?', [username]);
    
    if (!user || !isAdminRole(user.role)) {
        return res.render('admin/login', { error: '管理员账号不存在' });
    }
    
    const validPassword = bcrypt.compareSync(password, user.password);
    
    if (!validPassword) {
        return res.render('admin/login', { error: '密码错误' });
    }
    
    req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role,
        realName: user.real_name
    };
    
    res.redirect('/admin/dashboard');
});

// 管理员登出
app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});

// 管理员仪表板
app.get('/admin/dashboard', requireAdmin, (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    
    const stats = {
        totalUsers: queryOne('SELECT COUNT(*) as count FROM users WHERE role NOT IN ("admin", "superadmin")').count,
        totalResources: queryOne('SELECT COUNT(*) as count FROM resources').count,
        totalQuestions: queryOne('SELECT COUNT(*) as count FROM questions').count,
        todayNewUsers: queryOne('SELECT COUNT(*) as count FROM users WHERE role NOT IN ("admin", "superadmin") AND DATE(created_at) = ?', [today]).count
    };
    
    const activities = queryAll(`
        SELECT 
            'user' as type,
            real_name as title,
            '注册了账号' as description,
            created_at as time
        FROM users 
        WHERE role NOT IN ('admin', 'superadmin')
        UNION ALL
        SELECT 
            'resource' as type,
            title,
            '上传了新资源' as description,
            created_at as time
        FROM resources
        UNION ALL
        SELECT 
            'question' as type,
            SUBSTR(content, 1, 50) as title,
            '提出了新问题' as description,
            created_at as time
        FROM questions
        ORDER BY time DESC
        LIMIT 10
    `);
    
    res.render('admin/dashboard', { stats, activities });
});

// 用户管理页面
app.get('/admin/users', requireAdmin, (req, res) => {
    const { search = '', role = '', page = 1 } = req.query;
    const limit = 20;
    const offset = (page - 1) * limit;
    
    let query = 'SELECT * FROM users WHERE role NOT IN ("admin", "superadmin")';
    const params = [];
    
    if (search) {
        query += ' AND (username LIKE ? OR real_name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
    }
    
    if (role) {
        query += ' AND role = ?';
        params.push(role);
    }
    
    query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const rawUsers = queryAll(query, params);
    const users = rawUsers.map(u => ({
        id: u.id,
        username: u.username,
        realName: u.real_name,
        role: u.role,
        gradeLevel: u.grade_level,
        loginIp: u.login_ip || '-',
        createdAt: u.created_at
    }));
    
    const total = queryOne(`SELECT COUNT(*) as count FROM users WHERE role NOT IN ("admin", "superadmin") ${search ? 'AND (username LIKE ? OR real_name LIKE ?)' : ''} ${role ? 'AND role = ?' : ''}`, 
        [search ? `%${search}%` : '', search ? `%${search}%` : '', role].filter(p => p)).count;
    
    res.render('admin/users', { 
        users, 
        total, 
        currentPage: parseInt(page), 
        totalPages: Math.ceil(total / limit),
        search,
        role
    });
});

// 更新用户角色
app.post('/admin/users/:id/role', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { role } = req.body;
    
    if (!['student', 'teacher', 'admin'].includes(role)) {
        return res.status(400).json({ success: false, message: '无效的用户角色' });
    }
    
    if (role === 'admin') {
        return res.status(400).json({ success: false, message: '不能修改为管理员角色' });
    }
    
    run('UPDATE users SET role = ? WHERE id = ?', [role, id]);
    res.json({ success: true });
});

// 删除用户
app.post('/admin/users/:id/delete', requireAdmin, (req, res) => {
    const { id } = req.params;
    
    // 检查是否有关联数据
    const resourceCount = queryOne('SELECT COUNT(*) as count FROM resources WHERE author_id = ?', [id]).count;
    const questionCount = queryOne('SELECT COUNT(*) as count FROM questions WHERE author_id = ?', [id]).count;
    
    if (resourceCount > 0 || questionCount > 0) {
        return res.json({ 
            success: false, 
            message: '该用户存在关联数据，无法删除。请先删除或转移其相关资源。' 
        });
    }
    
    run('DELETE FROM users WHERE id = ?', [id]);
    res.json({ success: true });
});

// 资源管理页面
app.get('/admin/resources', requireAdmin, (req, res) => {
    const { search = '', type = '', page = 1 } = req.query;
    const limit = 20;
    const offset = (page - 1) * limit;
    
    let where = '1=1';
    const params = [];
    
    if (search) {
        where += ' AND (r.title LIKE ? OR r.content LIKE ? OR u.real_name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    if (type === 'teacher') {
        where += ' AND r.is_public = 2';
    } else if (type === 'public') {
        where += ' AND r.is_public = 1';
    } else if (type === 'private') {
        where += ' AND r.is_public = 0';
    }
    
    const rawResources = queryAll(`
        SELECT r.id, r.title, r.content, r.unit_area, r.unit_level, r.is_public, r.created_at,
               u.real_name as author_name
        FROM resources r 
        LEFT JOIN users u ON r.author_id = u.id 
        WHERE ${where}
        ORDER BY r.id DESC LIMIT ? OFFSET ?
    `, [...params, limit, offset]);
    
    const resources = rawResources.map(r => ({
        id: r.id,
        title: r.title,
        author: r.author_name,
        area: r.unit_area,
        level: r.unit_level,
        visibility: r.is_public === 2 ? 'teacher' : r.is_public === 1 ? 'public' : 'private',
        createdAt: r.created_at
    }));
    
    const total = queryOne(`SELECT COUNT(*) as count FROM resources r LEFT JOIN users u ON r.author_id = u.id WHERE ${where}`, params).count;
    
    res.render('admin/resources', { 
        resources, 
        total, 
        currentPage: parseInt(page), 
        totalPages: Math.ceil(total / limit),
        search,
        type
    });
});

// 更新资源可见性
app.post('/admin/resources/:id/visibility', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { is_public } = req.body;
    
    if (!['0', '1', '2'].includes(is_public)) {
        return res.status(400).json({ success: false, message: '无效的可见性设置' });
    }
    
    run('UPDATE resources SET is_public = ? WHERE id = ?', [parseInt(is_public), id]);
    res.json({ success: true });
});

// 删除资源
app.post('/admin/resources/:id/delete', requireAdmin, (req, res) => {
    const { id } = req.params;
    
    // 获取资源信息用于日志
    const resource = queryOne('SELECT * FROM resources WHERE id = ?', [id]);
    if (!resource) {
        return res.json({ success: false, message: '资源不存在' });
    }
    
    run('DELETE FROM resources WHERE id = ?', [id]);
    res.json({ success: true });
});

// 问答管理页面
app.get('/admin/questions', requireAdmin, (req, res) => {
    const { search = '', answered = '', page = 1 } = req.query;
    const limit = 20;
    const offset = (page - 1) * limit;
    
    let where = '1=1';
    const params = [];
    
    if (search) {
        where += ' AND (q.content LIKE ? OR q.author_name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
    }
    
    if (answered === '1') {
        where += ' AND q.is_answered = 1';
    } else if (answered === '0') {
        where += ' AND q.is_answered = 0';
    }
    
    const questions = queryAll(`
        SELECT q.id, q.content, q.author_name as author, q.is_answered as answered, q.created_at as createdAt,
               q.unit_area, a.content as answerContent, a.author_name as answerAuthor, a.created_at as answerCreatedAt
        FROM questions q 
        LEFT JOIN answers a ON q.id = a.question_id 
        WHERE ${where}
        ORDER BY q.created_at DESC LIMIT ? OFFSET ?
    `, [...params, limit, offset]);
    
    questions.forEach(q => {
        if (q.answerContent) {
            q.answer = { content: q.answerContent, author: q.answerAuthor, createdAt: q.answerCreatedAt };
        } else {
            q.answer = null;
        }
        delete q.answerContent;
        delete q.answerAuthor;
        delete q.answerCreatedAt;
    });
    
    const total = queryOne(`SELECT COUNT(*) as count FROM questions q WHERE ${where}`, params).count;
    
    res.render('admin/questions', { 
        questions, 
        total, 
        currentPage: parseInt(page), 
        totalPages: Math.ceil(total / limit),
        search,
        answered,
        filterStatus: answered
    });
});

app.put('/admin/api/users/:id/role', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { role } = req.body;
    
    if (!['student', 'teacher'].includes(role)) {
        return res.status(400).json({ success: false, message: '无效的角色' });
    }
    
    run('UPDATE users SET role = ? WHERE id = ?', [role, id]);
    res.json({ success: true });
});

app.delete('/admin/api/users/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    
    const resourceCount = queryOne('SELECT COUNT(*) as count FROM resources WHERE author_id = ?', [id]).count;
    const questionCount = queryOne('SELECT COUNT(*) as count FROM questions WHERE author_id = ?', [id]).count;
    
    if (resourceCount > 0 || questionCount > 0) {
        return res.json({ success: false, message: '该用户存在关联数据，无法删除' });
    }
    
    run('DELETE FROM users WHERE id = ?', [id]);
    res.json({ success: true });
});

app.put('/admin/api/resources/:id/visibility', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { is_public } = req.body;
    
    if (!['0', '1', '2'].includes(String(is_public))) {
        return res.status(400).json({ success: false, message: '无效的可见性' });
    }
    
    run('UPDATE resources SET is_public = ? WHERE id = ?', [parseInt(is_public), id]);
    res.json({ success: true });
});

app.delete('/admin/api/resources/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    
    const resource = queryOne('SELECT * FROM resources WHERE id = ?', [id]);
    if (!resource) {
        return res.json({ success: false, message: '资源不存在' });
    }
    
    run('DELETE FROM resources WHERE id = ?', [id]);
    res.json({ success: true });
});

// 删除问题
app.post('/admin/questions/:id/delete', requireAdmin, (req, res) => {
    const { id } = req.params;
    
    run('DELETE FROM answers WHERE question_id = ?', [id]);
    run('DELETE FROM questions WHERE id = ?', [id]);
    
    res.json({ success: true });
});

app.delete('/admin/api/questions/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    
    run('DELETE FROM answers WHERE question_id = ?', [id]);
    run('DELETE FROM questions WHERE id = ?', [id]);
    
    res.json({ success: true });
});

// 删除回答
app.post('/admin/answers/:id/delete', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { question_id } = req.body;
    
    run('DELETE FROM answers WHERE id = ?', [id]);
    run('UPDATE questions SET is_answered = 0 WHERE id = ?', [question_id]);
    
    res.json({ success: true });
});

app.delete('/admin/api/questions/:id/answer', requireAdmin, (req, res) => {
    const { id } = req.params;
    
    run('DELETE FROM answers WHERE question_id = ?', [id]);
    run('UPDATE questions SET is_answered = 0 WHERE id = ?', [id]);
    
    res.json({ success: true });
});

// 统计页面
app.get('/admin/stats', requireAdmin, (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const last7Days = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const last30Days = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    
    // 用户统计
    const userStats = {
        total: queryOne('SELECT COUNT(*) as count FROM users WHERE role != "admin"').count,
        newToday: queryOne('SELECT COUNT(*) as count FROM users WHERE role != "admin" AND DATE(created_at) = ?', [today]).count,
        newLast7Days: queryOne('SELECT COUNT(*) as count FROM users WHERE role != "admin" AND DATE(created_at) >= ?', [last7Days]).count,
        studentCount: queryOne('SELECT COUNT(*) as count FROM users WHERE role = "student"').count,
        teacherCount: queryOne('SELECT COUNT(*) as count FROM users WHERE role = "teacher"').count,
        activeToday: queryOne(`
            SELECT COUNT(DISTINCT user_id) as count FROM (
                SELECT author_id as user_id, created_at FROM resources WHERE DATE(created_at) = ?
                UNION ALL
                SELECT author_id as user_id, created_at FROM questions WHERE DATE(created_at) = ?
                UNION ALL
                SELECT user_id as user_id, attempted_at as created_at FROM quiz_attempts WHERE DATE(attempted_at) = ?
            ) t
        `, [today, today, today]).count
    };
    
    // 资源统计
    const resourceStats = {
        total: queryOne('SELECT COUNT(*) as count FROM resources').count,
        public: queryOne('SELECT COUNT(*) as count FROM resources WHERE is_public = 1').count,
        teacher: queryOne('SELECT COUNT(*) as count FROM resources WHERE is_public = 2').count,
        private: queryOne('SELECT COUNT(*) as count FROM resources WHERE is_public = 0').count,
        newToday: queryOne('SELECT COUNT(*) as count FROM resources WHERE DATE(created_at) = ?', [today]).count,
        byMonth: queryAll(`
            SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count 
            FROM resources 
            WHERE created_at >= date('now', '-12 months')
            GROUP BY strftime('%Y-%m', created_at)
            ORDER BY month DESC
            LIMIT 6
        `)
    };
    
    // 问答统计
    const questionStats = {
        total: queryOne('SELECT COUNT(*) as count FROM questions').count,
        answered: queryOne('SELECT COUNT(*) as count FROM questions WHERE is_answered = 1').count,
        unanswered: queryOne('SELECT COUNT(*) as count FROM questions WHERE is_answered = 0').count,
        answerRate: queryOne('SELECT ROUND(SUM(CASE WHEN is_answered = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as rate FROM questions').rate || 0,
        byMonth: queryAll(`
            SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count 
            FROM questions 
            WHERE created_at >= date('now', '-12 months')
            GROUP BY strftime('%Y-%m', created_at)
            ORDER BY month DESC
            LIMIT 6
        `)
    };
    
    // 闯关统计
    const quizStats = {
        totalAttempts: queryOne('SELECT COUNT(*) as count FROM quiz_attempts').count,
        correctAttempts: queryOne('SELECT COUNT(*) as count FROM quiz_attempts WHERE is_correct = 1').count,
        accuracy: queryOne('SELECT ROUND(SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as rate FROM quiz_attempts').rate || 0,
        byUnitLevel: queryAll(`
            SELECT q.unit_level, COUNT(*) as total, SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) as correct
            FROM quiz_questions q
            LEFT JOIN quiz_attempts a ON q.id = a.question_id
            GROUP BY q.unit_level
            ORDER BY total DESC
        `)
    };
    
    const quizByLevel = (quizStats.byUnitLevel || []).map(row => ({
        name: '单元 ' + (row.unit_level || '-'),
        attempts: row.total || 0,
        correct: row.correct || 0,
        rate: row.total > 0 ? Math.round((row.correct || 0) * 100 / row.total) : 0
    }));

    const stats = {
        userTotal: userStats.total,
        studentTotal: userStats.studentCount,
        teacherTotal: userStats.teacherCount,
        newToday: userStats.newToday,
        newWeek: userStats.newLast7Days,
        activeToday: userStats.activeToday,
        resourceTotal: resourceStats.total,
        resourcePublic: resourceStats.public,
        resourceTeacher: resourceStats.teacher,
        resourcePrivate: resourceStats.private,
        resourceNewToday: resourceStats.newToday,
        questionTotal: questionStats.total,
        questionAnswered: questionStats.answered,
        questionUnanswered: questionStats.unanswered,
        answerRate: questionStats.answerRate,
        quizTotalAttempts: quizStats.totalAttempts,
        quizCorrect: quizStats.correctAttempts,
        quizAccuracy: quizStats.accuracy,
        quizByLevel
    };

    res.render('admin/stats', { stats });
});

// ============ AI配置管理 ============

// AI配置页面
app.get('/admin/ai-config', requireAdmin, (req, res) => {
    let config = queryOne('SELECT * FROM ai_config WHERE id = 1');
    if (!config) {
        config = { api_url: '', api_key: '', model_name: '', system_prompt: '你是知行智汇平台的AI助手，专注于南京幕燕滨江研学相关的知识问答。请用简洁友好的方式回答用户问题。', temperature: 0.7, max_tokens: 1024 };
    }
    res.render('admin/ai-config', { config, success: req.query.success, error: req.query.error });
});

// 保存AI配置
app.post('/admin/ai-config', requireAdmin, (req, res) => {
    const { api_url, api_key, model_name, system_prompt, temperature, max_tokens } = req.body;

    if (!api_url || !model_name) {
        return res.redirect('/admin/ai-config?error=' + encodeURIComponent('API地址和模型名称必填'));
    }

    const existing = queryOne('SELECT * FROM ai_config WHERE id = 1');
    if (existing) {
        run('UPDATE ai_config SET api_url=?, api_key=?, model_name=?, system_prompt=?, temperature=?, max_tokens=?, updated_at=CURRENT_TIMESTAMP WHERE id=1',
            [api_url, api_key || '', model_name, system_prompt || '', parseFloat(temperature) || 0.7, parseInt(max_tokens) || 1024]);
    } else {
        run('INSERT INTO ai_config (id, api_url, api_key, model_name, system_prompt, temperature, max_tokens) VALUES (1,?,?,?,?,?,?)',
            [api_url, api_key || '', model_name, system_prompt || '', parseFloat(temperature) || 0.7, parseInt(max_tokens) || 1024]);
    }

    res.redirect('/admin/ai-config?success=1');
});

// 测试AI连接
app.post('/admin/api/ai/test', requireAdmin, async (req, res) => {
    const config = queryOne('SELECT * FROM ai_config WHERE id = 1');
    if (!config || !config.api_url || !config.model_name) {
        return res.json({ success: false, message: '请先配置AI接口信息' });
    }

    try {
        const https = require('https');
        const http = require('http');
        const url = new URL(config.api_url);
        const isHttps = url.protocol === 'https:';
        const client = isHttps ? https : http;

        const postData = JSON.stringify({
            model: config.model_name,
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 5,
            temperature: 0.7,
            stream: false
        });

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        if (config.api_key) headers['Authorization'] = 'Bearer ' + config.api_key;

        const response = await new Promise((resolve, reject) => {
            const r = client.request({
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + url.search,
                method: 'POST',
                headers
            }, (resp) => {
                let data = '';
                resp.on('data', chunk => data += chunk);
                resp.on('end', () => resolve({ status: resp.statusCode, data }));
            });
            r.on('error', reject);
            r.setTimeout(15000, () => { r.destroy(); reject(new Error('请求超时')); });
            r.write(postData);
            r.end();
        });

        if (response.status === 200) {
            res.json({ success: true });
        } else {
            let msg = '接口返回错误 ' + response.status;
            try {
                const body = JSON.parse(response.data);
                msg = body.error?.message || body.message || msg;
            } catch (e) {}
            res.json({ success: false, message: msg });
        }
    } catch (err) {
        res.json({ success: false, message: err.message || '连接失败' });
    }
});

// AI对话API
app.post('/api/ai/chat', async (req, res) => {
    const { messages } = req.body;

    const config = queryOne('SELECT * FROM ai_config WHERE id = 1');
    if (!config || !config.api_url || !config.model_name) {
        return res.json({ success: false, message: 'AI功能暂未配置，请联系管理员' });
    }

    try {
        const https = require('https');
        const http = require('http');
        const url = new URL(config.api_url);
        const isHttps = url.protocol === 'https:';
        const client = isHttps ? https : http;

        const apiMessages = [
            { role: 'system', content: config.system_prompt || '你是知行智汇平台的AI助手。' },
            ...(messages || [])
        ];

        const postData = JSON.stringify({
            model: config.model_name,
            messages: apiMessages,
            max_tokens: config.max_tokens || 1024,
            temperature: config.temperature || 0.7,
            stream: false
        });

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        if (config.api_key) headers['Authorization'] = 'Bearer ' + config.api_key;

        const response = await new Promise((resolve, reject) => {
            const r = client.request({
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + url.search,
                method: 'POST',
                headers
            }, (resp) => {
                let data = '';
                resp.on('data', chunk => data += chunk);
                resp.on('end', () => resolve({ status: resp.statusCode, data }));
            });
            r.on('error', reject);
            r.setTimeout(30000, () => { r.destroy(); reject(new Error('AI响应超时')); });
            r.write(postData);
            r.end();
        });

        if (response.status === 200) {
            const body = JSON.parse(response.data);
            const reply = body.choices?.[0]?.message?.content || '抱歉，无法生成回复';
            res.json({ success: true, reply });
        } else {
            let msg = 'AI接口错误 ' + response.status;
            try {
                const body = JSON.parse(response.data);
                msg = body.error?.message || body.message || msg;
            } catch (e) {}
            res.json({ success: false, message: msg });
        }
    } catch (err) {
        res.json({ success: false, message: err.message || 'AI服务连接失败' });
    }
});

// ============ API路由 ============

// 获取点位数据 (供后续扩展)
app.get('/api/points', (req, res) => {
    const points = queryAll('SELECT * FROM study_points');
    points.forEach(p => {
        p.grade_levels = JSON.parse(p.grade_levels || '[]');
        p.tasks = JSON.parse(p.tasks || '[]');
        p.video_links = JSON.parse(p.video_links || '[]');
    });
    res.json(points);
});

// 获取题目数据
app.get('/api/questions', (req, res) => {
    const questions = queryAll('SELECT * FROM quiz_questions');
    questions.forEach(q => {
        if (q.options) q.options = JSON.parse(q.options);
    });
    res.json(questions);
});

// 错误处理
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('服务器错误: ' + err.message);
});

// 启动服务器
async function startServer() {
    try {
        await initDatabase();

        app.listen(PORT, () => {
            console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║         知行智汇平台 服务器已启动                          ║
║                                                          ║
║         访问地址: http://localhost:${PORT}                  ║
║                                                          ║
║         测试账号:                                        ║
║         学生: student1 / test123                         ║
║         教师: teacher1 / test123                         ║
║         管理员: admin / admin123                         ║
║         后台管理: http://localhost:${PORT}/admin/login    ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
            `);
        });
    } catch (err) {
        console.error('启动失败:', err);
    }
}

startServer();
