const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const multer = require('multer');
const XLSX = require('xlsx');
const nodemailer = require('nodemailer');
const ldap = require('ldapjs');
const winston = require('winston');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});

// Logger setup
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'pharma-planner' },
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

// Database connection
const pool = new Pool({
    user: process.env.DB_USER || 'pharma_user',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'pharma_manufacturing',
    password: process.env.DB_PASSWORD || 'secure_password',
    port: process.env.DB_PORT || 5432,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Email transporter setup
const mailTransporter = nodemailer.createTransporter({
    host: process.env.SMTP_HOST || 'smtp.company.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER || 'system@company.com',
        pass: process.env.SMTP_PASSWORD || 'password'
    }
});

// LDAP client setup
const ldapClient = ldap.createClient({
    url: process.env.LDAP_URL || 'ldap://localhost:389'
});

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        }
    }
}));
app.use(compression());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // limit each IP to 1000 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /xlsx|xls|csv|jpg|jpeg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only xlsx, xls, csv, and image files are allowed'));
        }
    }
});

// Static files
app.use(express.static('public'));

// JWT verification middleware
const verifyToken = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ message: 'Access token is required' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'pharma_secret_key');
        req.user = decoded;
        next();
    } catch (error) {
        logger.error('Token verification failed:', error);
        return res.status(401).json({ message: 'Invalid token' });
    }
};

// Role-based authorization middleware
const authorize = (roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Insufficient permissions' });
        }
        next();
    };
};

// LDAP Authentication function
const authenticateWithLDAP = async (username, password) => {
    return new Promise((resolve, reject) => {
        const dn = `uid=${username},ou=people,dc=company,dc=com`;
        
        ldapClient.bind(dn, password, (err) => {
            if (err) {
                logger.error('LDAP authentication failed:', err);
                reject(err);
            } else {
                ldapClient.search(`ou=people,dc=company,dc=com`, {
                    filter: `(uid=${username})`,
                    scope: 'sub'
                }, (err, res) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    const entries = [];
                    res.on('searchEntry', (entry) => {
                        entries.push(entry.object);
                    });
                    
                    res.on('end', () => {
                        if (entries.length > 0) {
                            resolve(entries[0]);
                        } else {
                            reject(new Error('User not found in LDAP'));
                        }
                    });
                });
            }
        });
    });
};

// Authentication Routes
app.post('/api/auth/login', [
    body('username').notEmpty().trim().escape(),
    body('password').notEmpty()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        const { username, password } = req.body;
        
        // Try local authentication first, then LDAP
        let user;
        try {
            const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
            if (result.rows.length > 0) {
                user = result.rows[0];
                const isValidPassword = await bcrypt.compare(password, user.password);
                if (!isValidPassword) {
                    throw new Error('Invalid credentials');
                }
            } else {
                // Try LDAP authentication
                const ldapUser = await authenticateWithLDAP(username, password);
                
                // Create user in local database if not exists
                const hashedPassword = await bcrypt.hash(password, 12);
                const insertResult = await pool.query(
                    'INSERT INTO users (username, email, password, role, first_name, last_name, is_ldap_user) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
                    [username, ldapUser.mail || `${username}@company.com`, hashedPassword, 'User', ldapUser.givenName || '', ldapUser.sn || '', true]
                );
                user = insertResult.rows[0];
            }
        } catch (error) {
            logger.error('Authentication error:', error);
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        
        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: user.id, 
                username: user.username, 
                role: user.role 
            },
            process.env.JWT_SECRET || 'pharma_secret_key',
            { expiresIn: '8h' }
        );
        
        // Update last login
        await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
        
        // Log successful login
        logger.info(`User ${username} logged in successfully`);
        
        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                firstName: user.first_name,
                lastName: user.last_name,
                needsPasswordChange: user.needs_password_change
            }
        });
        
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.post('/api/auth/signup', [
    body('username').isLength({ min: 3 }).trim().escape(),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('firstName').notEmpty().trim().escape(),
    body('lastName').notEmpty().trim().escape()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        const { username, email, password, firstName, lastName } = req.body;
        
        // Check if user already exists
        const existingUser = await pool.query('SELECT id FROM users WHERE username = $1 OR email = $2', [username, email]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ message: 'User already exists' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);
        
        // Insert new user
        const result = await pool.query(
            'INSERT INTO users (username, email, password, first_name, last_name, role, needs_password_change) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, username, email, role',
            [username, email, hashedPassword, firstName, lastName, 'User', true]
        );
        
        logger.info(`New user registered: ${username}`);
        
        res.status(201).json({
            message: 'User created successfully',
            user: result.rows[0]
        });
        
    } catch (error) {
        logger.error('Signup error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.post('/api/auth/change-password', verifyToken, [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        const { currentPassword, newPassword } = req.body;
        
        // Get current user
        const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.userId]);
        const user = userResult.rows[0];
        
        // Verify current password
        const isValidPassword = await bcrypt.compare(currentPassword, user.password);
        if (!isValidPassword) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }
        
        // Hash new password
        const hashedNewPassword = await bcrypt.hash(newPassword, 12);
        
        // Update password
        await pool.query(
            'UPDATE users SET password = $1, needs_password_change = FALSE, updated_at = NOW() WHERE id = $2',
            [hashedNewPassword, req.user.userId]
        );
        
        logger.info(`Password changed for user: ${user.username}`);
        
        res.json({ message: 'Password changed successfully' });
        
    } catch (error) {
        logger.error('Change password error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// User Management Routes
app.get('/api/users', verifyToken, authorize(['Super Admin', 'Admin']), async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, email, first_name, last_name, role, created_at, last_login, is_active FROM users ORDER BY created_at DESC'
        );
        
        res.json(result.rows);
    } catch (error) {
        logger.error('Get users error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.post('/api/users', verifyToken, authorize(['Super Admin', 'Admin']), [
    body('username').isLength({ min: 3 }).trim().escape(),
    body('email').isEmail().normalizeEmail(),
    body('firstName').notEmpty().trim().escape(),
    body('lastName').notEmpty().trim().escape(),
    body('role').isIn(['Super Admin', 'Admin', 'User'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        const { username, email, firstName, lastName, role } = req.body;
        
        // Check permissions - Admin can only create Users
        if (req.user.role === 'Admin' && role !== 'User') {
            return res.status(403).json({ message: 'Insufficient permissions to create this role' });
        }
        
        // Generate temporary password
        const tempPassword = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(tempPassword, 12);
        
        const result = await pool.query(
            'INSERT INTO users (username, email, password, first_name, last_name, role, needs_password_change) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, username, email, role',
            [username, email, hashedPassword, firstName, lastName, role, true]
        );
        
        // Send email with temporary password
        try {
            await mailTransporter.sendMail({
                from: process.env.SMTP_FROM || 'system@company.com',
                to: email,
                subject: 'Welcome to Pharma Manufacturing Planner',
                html: `
                    <h2>Welcome to Pharma Manufacturing Planner</h2>
                    <p>Your account has been created with the following credentials:</p>
                    <p><strong>Username:</strong> ${username}</p>
                    <p><strong>Temporary Password:</strong> ${tempPassword}</p>
                    <p>Please login and change your password immediately.</p>
                `
            });
        } catch (emailError) {
            logger.error('Failed to send welcome email:', emailError);
        }
        
        logger.info(`User created: ${username} by ${req.user.username}`);
        
        res.status(201).json({
            message: 'User created successfully',
            user: result.rows[0],
            tempPassword: tempPassword // Include for admin reference
        });
        
    } catch (error) {
        logger.error('Create user error:', error);
        if (error.code === '23505') { // Unique constraint violation
            return res.status(400).json({ message: 'Username or email already exists' });
        }
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.put('/api/users/:id', verifyToken, authorize(['Super Admin', 'Admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { firstName, lastName, role, isActive } = req.body;
        
        // Check permissions
        if (req.user.role === 'Admin' && role && role !== 'User') {
            return res.status(403).json({ message: 'Insufficient permissions to assign this role' });
        }
        
        const result = await pool.query(
            'UPDATE users SET first_name = $1, last_name = $2, role = $3, is_active = $4, updated_at = NOW() WHERE id = $5 RETURNING id, username, email, first_name, last_name, role, is_active',
            [firstName, lastName, role, isActive, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        logger.info(`User updated: ${result.rows[0].username} by ${req.user.username}`);
        
        res.json({
            message: 'User updated successfully',
            user: result.rows[0]
        });
        
    } catch (error) {
        logger.error('Update user error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.delete('/api/users/:id', verifyToken, authorize(['Super Admin']), async (req, res) => {
    try {
        const { id } = req.params;
        
        // Prevent deleting self
        if (parseInt(id) === req.user.userId) {
            return res.status(400).json({ message: 'Cannot delete your own account' });
        }
        
        const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING username', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        logger.info(`User deleted: ${result.rows[0].username} by ${req.user.username}`);
        
        res.json({ message: 'User deleted successfully' });
        
    } catch (error) {
        logger.error('Delete user error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Continue with other routes in the next part...

module.exports = { app, server, io, pool, logger };