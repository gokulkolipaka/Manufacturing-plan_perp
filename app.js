// Manufacturing Planning System with Version Control
// Global Application State
let currentUser = null;
let currentPage = 'dashboard';
let editingCell = null;
let charts = {};
let autoCommitInterval = null;

// Application Data Structure
let appData = {
    equipment: [
        {name: "Granulation 150L", type: "granulation", capacity: "150L", status: "active"},
        {name: "Granulation 700L", type: "granulation", capacity: "700L", status: "active"},
        {name: "Granulation 1400L", type: "granulation", capacity: "1400L", status: "active"},
        {name: "FBP-01", type: "fbp", capacity: "standard", status: "maintenance"},
        {name: "FBP-02", type: "fbp", capacity: "standard", status: "active"},
        {name: "Compression-1", type: "compression", capacity: "27-D", status: "active"},
        {name: "Compression-2", type: "compression", capacity: "21-D", status: "active"},
        {name: "Coating-01", type: "coating", capacity: "standard", status: "active"},
        {name: "Blending-01", type: "blending", capacity: "4000L", status: "active"}
    ],
    materials: {
        api: [
            {name: "Trazodone HCL", stock: 3321, reorderLevel: 500, leadTime: 45, category: "api"},
            {name: "Atorvastatin", stock: 1250, reorderLevel: 200, leadTime: 30, category: "api"}
        ],
        excipients: [
            {name: "Microcrystalline Cellulose", category: "filler", stock: 3287, reorderLevel: 1000, leadTime: 21},
            {name: "Lactose Anhydrous", category: "filler", stock: 4289, reorderLevel: 1500, leadTime: 28},
            {name: "Magnesium Stearate", category: "lubricant", stock: 194, reorderLevel: 500, leadTime: 14},
            {name: "Croscarmellose Sodium", category: "disintegrant", stock: 1567, reorderLevel: 300, leadTime: 35},
            {name: "Povidone K30", category: "binder", stock: 892, reorderLevel: 200, leadTime: 42}
        ],
        packaging: [
            {name: "150 CC HDPE Bottle", stock: 83470, reorderLevel: 10000, leadTime: 14, category: "packaging"},
            {name: "38mm Child Resistant Closure", stock: 377049, reorderLevel: 50000, leadTime: 21, category: "packaging"}
        ]
    },
    users: [
        {id: 1, username: "admin", role: "Super Admin", email: "admin@company.com", defaultPassword: true},
        {id: 2, username: "manager", role: "Manager", email: "manager@company.com", defaultPassword: true},
        {id: 3, username: "editor", role: "Editor", email: "editor@company.com", defaultPassword: true},
        {id: 4, username: "viewer", role: "Viewer", email: "viewer@company.com", defaultPassword: true}
    ],
    schedule: {
        "2024-08-11": {
            "Granulation 700L": {activity: "Production", batch: "Panta-CB-20", product: "Pantoprazole"},
            "FBP-01": {activity: "Maintenance", batch: "", product: ""},
            "Compression-1": {activity: "Production", batch: "CLO-EB-03", product: "Clopidogrel"}
        },
        "2024-08-12": {
            "Granulation 700L": {activity: "Production", batch: "Panta-CB-21", product: "Pantoprazole"},
            "FBP-01": {activity: "Production", batch: "ATR-78", product: "Atorvastatin"},
            "Compression-1": {activity: "Cleaning", batch: "", product: ""}
        }
    },
    companySettings: {
        name: "PharmaCorp Manufacturing",
        logo: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjQwIiB2aWV3Qm94PSIwIDAgMTAwIDQwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iNDAiIGZpbGw9IiMyMTgwNjEiLz48dGV4dCB4PSI1MCIgeT0iMjUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiPlBoYXJtYUNvcnA8L3RleHQ+PC9zdmc+"
    }
};

let currentMonth = new Date(2024, 7); // August 2024

// ==================== VERSION CONTROL SYSTEM ====================

class VersionControl {
    constructor() {
        this.currentBranch = 'main';
        this.workingData = null;
        this.lastCommitData = null;
        this.pendingChanges = 0;
        this.autoCommitEnabled = false;
        this.autoCommitInterval = 5; // minutes
        this.requireApprovalForCommits = false;
        
        this.initializeVersionControl();
    }

    async initializeVersionControl() {
        try {
            // Initialize branches if not exists
            const branches = this.getBranches();
            if (!branches.find(b => b.name === 'main')) {
                this.createBranch('main', null, 'system', new Date());
            }

            // Set current branch
            const savedBranch = localStorage.getItem('currentBranch');
            this.currentBranch = savedBranch || 'main';

            // Initialize working data
            this.workingData = JSON.parse(JSON.stringify(appData));
            
            // Get last commit for current branch
            await this.updateLastCommitData();

            // Initialize auto-commit if enabled
            const settings = this.getVersionSettings();
            if (settings.autoCommitEnabled) {
                this.startAutoCommit();
            }

            this.updateUI();
        } catch (error) {
            console.error('Error initializing version control:', error);
        }
    }

    getBranches() {
        const branches = localStorage.getItem('branches');
        return branches ? JSON.parse(branches) : [];
    }

    saveBranches(branches) {
        localStorage.setItem('branches', JSON.stringify(branches));
    }

    createBranch(name, parentBranch, createdBy, createdAt) {
        const branches = this.getBranches();
        
        if (branches.find(b => b.name === name)) {
            throw new Error(`Branch '${name}' already exists`);
        }

        const newBranch = {
            name,
            parentBranch,
            createdBy,
            createdAt: createdAt.toISOString(),
            headCommit: null
        };

        branches.push(newBranch);
        this.saveBranches(branches);
        
        // Create initial commit for main branch
        if (name === 'main') {
            this.createInitialCommit();
        }
        
        this.auditLog('branch', `Created branch '${name}'`);
        return newBranch;
    }

    async createInitialCommit() {
        const commitId = uuidv4();
        const commit = {
            id: commitId,
            timestamp: new Date().toISOString(),
            author: 'system',
            branch: 'main',
            commitMessage: 'Initial commit',
            parentId: null,
            requiresApproval: false,
            approved: true,
            dataSnapshot: JSON.parse(JSON.stringify(appData)),
            comment: 'System-generated initial commit'
        };

        await idbKeyval.set(`commit-${commitId}`, commit);
        
        // Update branch head
        const branches = this.getBranches();
        const mainBranch = branches.find(b => b.name === 'main');
        if (mainBranch) {
            mainBranch.headCommit = commitId;
            this.saveBranches(branches);
        }
    }

    switchBranch(branchName) {
        const branches = this.getBranches();
        const branch = branches.find(b => b.name === branchName);
        
        if (!branch) {
            throw new Error(`Branch '${branchName}' does not exist`);
        }

        this.currentBranch = branchName;
        localStorage.setItem('currentBranch', branchName);
        
        // Load branch data
        this.loadBranchData(branchName);
        this.updateUI();
        this.auditLog('branch', `Switched to branch '${branchName}'`);
    }

    async loadBranchData(branchName) {
        const branches = this.getBranches();
        const branch = branches.find(b => b.name === branchName);
        
        if (branch && branch.headCommit) {
            const commit = await idbKeyval.get(`commit-${branch.headCommit}`);
            if (commit) {
                this.workingData = JSON.parse(JSON.stringify(commit.dataSnapshot));
                appData = JSON.parse(JSON.stringify(commit.dataSnapshot));
                this.lastCommitData = JSON.parse(JSON.stringify(commit.dataSnapshot));
            }
        }
    }

    async updateLastCommitData() {
        const branches = this.getBranches();
        const currentBranchObj = branches.find(b => b.name === this.currentBranch);
        
        if (currentBranchObj && currentBranchObj.headCommit) {
            const commit = await idbKeyval.get(`commit-${currentBranchObj.headCommit}`);
            if (commit) {
                this.lastCommitData = JSON.parse(JSON.stringify(commit.dataSnapshot));
            }
        }
    }

    calculateChanges() {
        if (!this.lastCommitData) {
            this.pendingChanges = 0;
            return [];
        }

        const changes = [];
        const currentData = JSON.stringify(appData);
        const lastData = JSON.stringify(this.lastCommitData);

        if (currentData !== lastData) {
            // Simple change detection - in a real app, you'd want more granular diff
            const diff = this.deepDiff(this.lastCommitData, appData);
            changes.push(...diff);
        }

        this.pendingChanges = changes.length;
        return changes;
    }

    deepDiff(obj1, obj2, path = '') {
        const changes = [];
        const keys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);

        for (const key of keys) {
            const currentPath = path ? `${path}.${key}` : key;
            const val1 = obj1?.[key];
            const val2 = obj2?.[key];

            if (val1 === undefined && val2 !== undefined) {
                changes.push({ type: 'added', path: currentPath, value: val2 });
            } else if (val1 !== undefined && val2 === undefined) {
                changes.push({ type: 'deleted', path: currentPath, value: val1 });
            } else if (typeof val1 === 'object' && typeof val2 === 'object') {
                changes.push(...this.deepDiff(val1, val2, currentPath));
            } else if (val1 !== val2) {
                changes.push({ type: 'modified', path: currentPath, oldValue: val1, newValue: val2 });
            }
        }

        return changes;
    }

    async commit(message, requiresApproval = false) {
        const changes = this.calculateChanges();
        if (changes.length === 0) {
            throw new Error('No changes to commit');
        }

        const commitId = uuidv4();
        const branches = this.getBranches();
        const currentBranchObj = branches.find(b => b.name === this.currentBranch);

        const commit = {
            id: commitId,
            timestamp: new Date().toISOString(),
            author: currentUser.username,
            branch: this.currentBranch,
            commitMessage: message,
            parentId: currentBranchObj?.headCommit || null,
            requiresApproval,
            approved: requiresApproval ? null : true,
            dataSnapshot: JSON.parse(JSON.stringify(appData)),
            comment: '',
            changes
        };

        await idbKeyval.set(`commit-${commitId}`, commit);

        if (!requiresApproval) {
            // Update branch head immediately
            currentBranchObj.headCommit = commitId;
            this.saveBranches(branches);
            this.lastCommitData = JSON.parse(JSON.stringify(appData));
        }

        this.pendingChanges = 0;
        this.updateUI();
        this.auditLog('commit', `Committed changes: ${message}`, { commitId, requiresApproval });

        return commitId;
    }

    async approveCommit(commitId) {
        const commit = await idbKeyval.get(`commit-${commitId}`);
        if (!commit) {
            throw new Error('Commit not found');
        }

        if (!['Manager', 'Super Admin'].includes(currentUser.role)) {
            throw new Error('Insufficient permissions to approve commits');
        }

        commit.approved = true;
        commit.approvedBy = currentUser.username;
        commit.approvedAt = new Date().toISOString();
        
        await idbKeyval.set(`commit-${commitId}`, commit);

        // Update branch head
        const branches = this.getBranches();
        const branchObj = branches.find(b => b.name === commit.branch);
        if (branchObj) {
            branchObj.headCommit = commitId;
            this.saveBranches(branches);
        }

        this.auditLog('approval', `Approved commit: ${commit.commitMessage}`, { commitId });
    }

    async rejectCommit(commitId, reason) {
        const commit = await idbKeyval.get(`commit-${commitId}`);
        if (!commit) {
            throw new Error('Commit not found');
        }

        commit.approved = false;
        commit.rejectedBy = currentUser.username;
        commit.rejectedAt = new Date().toISOString();
        commit.rejectionReason = reason;
        
        await idbKeyval.set(`commit-${commitId}`, commit);
        this.auditLog('approval', `Rejected commit: ${commit.commitMessage}`, { commitId, reason });
    }

    async getCommits(branchName = null, limit = 50) {
        const commits = [];
        const keys = await idbKeyval.keys();
        const commitKeys = keys.filter(key => key.startsWith('commit-'));

        for (const key of commitKeys) {
            const commit = await idbKeyval.get(key);
            if (!branchName || commit.branch === branchName) {
                commits.push(commit);
            }
        }

        return commits
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);
    }

    async getPendingCommits() {
        const commits = await this.getCommits();
        return commits.filter(c => c.requiresApproval && c.approved === null);
    }

    getVersionSettings() {
        const settings = localStorage.getItem('versionSettings');
        return settings ? JSON.parse(settings) : {
            autoCommitEnabled: false,
            autoCommitInterval: 5,
            requireApprovalForCommits: false
        };
    }

    saveVersionSettings(settings) {
        localStorage.setItem('versionSettings', JSON.stringify(settings));
        this.autoCommitEnabled = settings.autoCommitEnabled;
        this.autoCommitInterval = settings.autoCommitInterval;
        this.requireApprovalForCommits = settings.requireApprovalForCommits;

        if (settings.autoCommitEnabled) {
            this.startAutoCommit();
        } else {
            this.stopAutoCommit();
        }
    }

    startAutoCommit() {
        this.stopAutoCommit(); // Clear existing interval
        
        autoCommitInterval = setInterval(() => {
            const changes = this.calculateChanges();
            if (changes.length > 0) {
                this.commit(`Auto-commit: ${changes.length} changes`, this.requireApprovalForCommits)
                    .catch(error => console.error('Auto-commit failed:', error));
            }
        }, this.autoCommitInterval * 60 * 1000);
    }

    stopAutoCommit() {
        if (autoCommitInterval) {
            clearInterval(autoCommitInterval);
            autoCommitInterval = null;
        }
    }

    updateUI() {
        document.getElementById('currentBranch').textContent = this.currentBranch;
        document.getElementById('changesCount').textContent = this.pendingChanges;
        
        const commitBtn = document.getElementById('commitBtn');
        if (commitBtn) {
            commitBtn.disabled = this.pendingChanges === 0;
        }

        // Update dashboard pending approvals count
        this.updatePendingApprovalsCount();
    }

    async updatePendingApprovalsCount() {
        const pendingCommits = await this.getPendingCommits();
        const pendingElement = document.getElementById('pendingApprovals');
        if (pendingElement) {
            pendingElement.textContent = pendingCommits.length;
        }
    }

    auditLog(action, description, details = {}) {
        const auditLog = JSON.parse(localStorage.getItem('auditLog') || '[]');
        
        const logEntry = {
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            user: currentUser?.username || 'system',
            action,
            description,
            details,
            branch: this.currentBranch
        };

        auditLog.unshift(logEntry);
        
        // Keep only last 1000 entries
        if (auditLog.length > 1000) {
            auditLog.splice(1000);
        }

        localStorage.setItem('auditLog', JSON.stringify(auditLog));
    }
}

// Initialize version control system
const versionControl = new VersionControl();

// ==================== APPLICATION CORE ====================

// Application Test Hooks for automation
window.__app = {
    login: (username, password) => {
        document.getElementById('username').value = username;
        document.getElementById('password').value = password;
        handleLogin();
    },
    commit: (message) => versionControl.commit(message),
    createBranch: (name, parent) => versionControl.createBranch(name, parent, currentUser.username, new Date()),
    switchBranch: (name) => versionControl.switchBranch(name),
    getCurrentUser: () => currentUser,
    getCurrentBranch: () => versionControl.currentBranch,
    getChangesCount: () => versionControl.pendingChanges
};

function initApp() {
    console.log('Initializing application...');
    
    loadSavedData();
    setupEventListeners();
    checkSavedLogin();
    applyTheme();
}

function setupEventListeners() {
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleLogin();
        });
    }

    // Signup form
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleSignup();
        });
    }

    // Change password form
    const changePasswordForm = document.getElementById('changePasswordForm');
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleChangePassword();
        });
    }

    // Version control forms
    const commitForm = document.getElementById('commitForm');
    if (commitForm) {
        commitForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleCommit();
        });
    }

    const createBranchForm = document.getElementById('createBranchForm');
    if (createBranchForm) {
        createBranchForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleCreateBranch();
        });
    }

    const mergeRequestForm = document.getElementById('mergeRequestForm');
    if (mergeRequestForm) {
        mergeRequestForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleMergeRequest();
        });
    }

    // Other forms
    const scheduleForm = document.getElementById('scheduleForm');
    if (scheduleForm) {
        scheduleForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleScheduleSubmit();
        });
    }

    const materialForm = document.getElementById('materialForm');
    if (materialForm) {
        materialForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleMaterialSubmit();
        });
    }

    const importForm = document.getElementById('importForm');
    if (importForm) {
        importForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleImportSubmit();
        });
    }

    // Schedule activity change
    const scheduleActivity = document.getElementById('scheduleActivity');
    if (scheduleActivity) {
        scheduleActivity.addEventListener('change', toggleBatchProductFields);
    }

    // Auto-save changes detection
    const observer = new MutationObserver(() => {
        if (versionControl) {
            versionControl.calculateChanges();
            versionControl.updateUI();
        }
    });

    // Watch for data changes
    setInterval(() => {
        if (versionControl && currentUser) {
            versionControl.calculateChanges();
            versionControl.updateUI();
        }
    }, 2000);
}

function loadSavedData() {
    const savedData = localStorage.getItem('manufacturingData');
    if (savedData) {
        try {
            const parsed = JSON.parse(savedData);
            appData = { ...appData, ...parsed };
        } catch (e) {
            console.error('Error loading saved data:', e);
        }
    }
}

function saveAppData() {
    try {
        localStorage.setItem('manufacturingData', JSON.stringify(appData));
        if (versionControl) {
            versionControl.calculateChanges();
            versionControl.updateUI();
        }
    } catch (e) {
        console.error('Error saving data:', e);
    }
}

function checkSavedLogin() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            showMainApp();
        } catch (e) {
            console.error('Error loading saved user:', e);
            localStorage.removeItem('currentUser');
        }
    }
}

// ==================== AUTHENTICATION ====================

function handleLogin() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    
    if (!username || !password) {
        alert('Please enter both username and password.');
        return;
    }
    
    // Find user
    const user = appData.users.find(u => u.username === username);
    
    // Demo authentication - in production, this would be secure
    if (user && password === 'admin123') {
        currentUser = user;
        localStorage.setItem('currentUser', JSON.stringify(user));
        
        if (user.defaultPassword) {
            showChangePasswordModal();
        } else {
            showMainApp();
        }
    } else {
        alert('Invalid credentials. Use password "admin123" for demo.');
    }
}

function handleSignup() {
    const username = document.getElementById('signupUsername').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (!username || !email || !password) {
        alert('Please fill in all fields');
        return;
    }
    
    if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
    }
    
    if (password.length < 6) {
        alert('Password must be at least 6 characters long');
        return;
    }
    
    if (appData.users.find(u => u.username === username)) {
        alert('Username already exists');
        return;
    }
    
    const newUser = {
        id: appData.users.length + 1,
        username,
        email,
        role: 'Viewer',
        defaultPassword: false
    };
    
    appData.users.push(newUser);
    alert('Account created successfully! Please log in.');
    hideSignup();
    saveAppData();
    versionControl.auditLog('user', `New user registered: ${username}`);
}

function handleChangePassword() {
    const newPassword = document.getElementById('newPassword').value.trim();
    const confirmNewPassword = document.getElementById('confirmNewPassword').value.trim();
    
    if (!newPassword || !confirmNewPassword) {
        alert('Please fill in both password fields');
        return;
    }
    
    if (newPassword !== confirmNewPassword) {
        alert('Passwords do not match');
        return;
    }
    
    if (newPassword.length < 6) {
        alert('Password must be at least 6 characters long');
        return;
    }
    
    currentUser.defaultPassword = false;
    const userIndex = appData.users.findIndex(u => u.id === currentUser.id);
    if (userIndex !== -1) {
        appData.users[userIndex].defaultPassword = false;
    }
    
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    saveAppData();
    
    hideChangePasswordModal();
    showMainApp();
    
    alert('Password updated successfully!');
    versionControl.auditLog('user', 'Password changed');
}

function showSignup() {
    document.getElementById('signupModal').classList.remove('hidden');
}

function hideSignup() {
    document.getElementById('signupModal').classList.add('hidden');
    document.getElementById('signupForm').reset();
}

function showForgotPassword() {
    alert('Please contact your system administrator to reset your password.');
}

function showChangePasswordModal() {
    document.getElementById('changePasswordModal').classList.remove('hidden');
}

function hideChangePasswordModal() {
    document.getElementById('changePasswordModal').classList.add('hidden');
    document.getElementById('changePasswordForm').reset();
}

function logout() {
    versionControl.auditLog('user', 'User logged out');
    
    currentUser = null;
    localStorage.removeItem('currentUser');
    document.getElementById('loginPage').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');
    
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    
    // Destroy charts
    Object.values(charts).forEach(chart => {
        if (chart && chart.destroy) {
            chart.destroy();
        }
    });
    charts = {};
    
    // Stop auto-commit
    if (versionControl) {
        versionControl.stopAutoCommit();
    }
}

function showMainApp() {
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    
    // Update user info
    document.getElementById('currentUser').textContent = `Welcome, ${currentUser.username}`;
    document.getElementById('currentRole').textContent = currentUser.role;
    
    // Update company info
    document.getElementById('appCompanyName').textContent = appData.companySettings.name;
    document.getElementById('appLogo').src = appData.companySettings.logo;
    
    setupNavigation();
    showPage('dashboard');
    
    // Initialize version control for this session
    if (versionControl) {
        versionControl.initializeVersionControl();
    }
    
    versionControl.auditLog('user', 'User logged in');
}

function setupNavigation() {
    const navItems = {
        'nav-users': ['Super Admin', 'Manager'],
        'nav-equipment': ['Super Admin'],
        'nav-settings': ['Super Admin', 'Manager'],
        'nav-audit': ['Super Admin', 'Manager']
    };
    
    Object.entries(navItems).forEach(([navId, allowedRoles]) => {
        const navElement = document.getElementById(navId);
        if (navElement) {
            if (!allowedRoles.includes(currentUser.role)) {
                navElement.style.display = 'none';
            } else {
                navElement.style.display = 'block';
            }
        }
    });
}

// ==================== VERSION CONTROL UI ====================

function openCommitModal() {
    const changes = versionControl.calculateChanges();
    if (changes.length === 0) {
        alert('No changes to commit');
        return;
    }

    // Populate changed files
    const changedFilesContainer = document.getElementById('changedFiles');
    let filesHTML = '';
    
    changes.forEach(change => {
        const icon = change.type === 'added' ? 'A' : 
                    change.type === 'deleted' ? 'D' : 'M';
        const iconClass = change.type === 'added' ? 'added' : 
                         change.type === 'deleted' ? 'deleted' : 'modified';
        
        filesHTML += `
            <div class="changed-file-item">
                <span class="file-status-icon ${iconClass}">${icon}</span>
                <span>${change.path}</span>
            </div>
        `;
    });
    
    changedFilesContainer.innerHTML = filesHTML;
    
    // Show/hide approval checkbox based on user role
    const requireApprovalGroup = document.getElementById('requireApprovalGroup');
    if (['Viewer', 'Editor'].includes(currentUser.role) || versionControl.requireApprovalForCommits) {
        requireApprovalGroup.style.display = 'none';
        document.getElementById('requireApproval').checked = true;
    } else {
        requireApprovalGroup.style.display = 'block';
    }
    
    document.getElementById('commitModal').classList.remove('hidden');
}

function closeCommitModal() {
    document.getElementById('commitModal').classList.add('hidden');
    document.getElementById('commitForm').reset();
}

async function handleCommit() {
    const message = document.getElementById('commitMessage').value.trim();
    const requireApproval = document.getElementById('requireApproval').checked;
    
    if (!message) {
        alert('Please enter a commit message');
        return;
    }
    
    try {
        await versionControl.commit(message, requireApproval);
        closeCommitModal();
        alert('Changes committed successfully!');
    } catch (error) {
        alert(`Failed to commit: ${error.message}`);
    }
}

async function openVersionHistory() {
    document.getElementById('versionHistoryModal').classList.remove('hidden');
    
    // Populate branch filter
    const branchFilter = document.getElementById('branchFilter');
    const branches = versionControl.getBranches();
    branchFilter.innerHTML = '<option value="all">All Branches</option>';
    branches.forEach(branch => {
        branchFilter.innerHTML += `<option value="${branch.name}">${branch.name}</option>`;
    });
    
    // Populate author filter
    const authorFilter = document.getElementById('authorFilter');
    authorFilter.innerHTML = '<option value="all">All Authors</option>';
    const uniqueAuthors = [...new Set(appData.users.map(u => u.username))];
    uniqueAuthors.forEach(author => {
        authorFilter.innerHTML += `<option value="${author}">${author}</option>`;
    });
    
    await loadVersionHistory();
    await loadPendingApprovals();
}

function closeVersionHistory() {
    document.getElementById('versionHistoryModal').classList.add('hidden');
}

async function loadVersionHistory() {
    const commits = await versionControl.getCommits();
    const versionList = document.getElementById('versionList');
    
    let historyHTML = '';
    commits.forEach(commit => {
        const date = dayjs(commit.timestamp).format('MMM DD, YYYY HH:mm');
        const approvalStatus = commit.requiresApproval ? 
            (commit.approved === null ? 'pending' : 
             commit.approved ? 'approved' : 'rejected') : '';
        
        historyHTML += `
            <div class="version-item" onclick="selectVersion('${commit.id}')">
                <input type="checkbox" class="version-checkbox" value="${commit.id}">
                <div class="version-info">
                    <div class="version-commit-id">${commit.id.substring(0, 8)}</div>
                    <div class="version-message">${commit.commitMessage}</div>
                    <div class="version-meta">
                        <span>By ${commit.author}</span>
                        <span>${date}</span>
                        <span>Branch: ${commit.branch}</span>
                    </div>
                    ${approvalStatus ? `<span class="approval-status ${approvalStatus}">${approvalStatus}</span>` : ''}
                </div>
                <div class="version-actions">
                    <button class="btn btn--outline btn--sm" onclick="viewCommitDetails('${commit.id}')">View</button>
                    ${canRevert(commit) ? `<button class="btn btn--outline btn--sm" onclick="revertCommit('${commit.id}')">Revert</button>` : ''}
                </div>
            </div>
        `;
    });
    
    versionList.innerHTML = historyHTML || '<p>No commits found.</p>';
}

async function loadPendingApprovals() {
    const pendingCommits = await versionControl.getPendingCommits();
    const pendingList = document.getElementById('pendingList');
    
    if (!['Manager', 'Super Admin'].includes(currentUser.role)) {
        pendingList.innerHTML = '<p>You do not have permission to view pending approvals.</p>';
        return;
    }
    
    let pendingHTML = '';
    pendingCommits.forEach(commit => {
        const date = dayjs(commit.timestamp).format('MMM DD, YYYY HH:mm');
        
        pendingHTML += `
            <div class="pending-item">
                <div class="pending-header">
                    <div>
                        <strong>${commit.commitMessage}</strong>
                        <div style="font-size: 12px; color: var(--color-text-secondary);">
                            By ${commit.author} on ${date} (${commit.branch})
                        </div>
                    </div>
                    <div class="pending-actions">
                        <button class="btn btn--success btn--sm" onclick="approveCommit('${commit.id}')">Approve</button>
                        <button class="btn btn--error btn--sm" onclick="rejectCommit('${commit.id}')">Reject</button>
                    </div>
                </div>
                <div style="font-size: 12px; margin-top: 8px;">
                    ${commit.changes.length} changes
                </div>
            </div>
        `;
    });
    
    pendingList.innerHTML = pendingHTML || '<p>No pending approvals.</p>';
}

function canRevert(commit) {
    return ['Manager', 'Super Admin'].includes(currentUser.role) && 
           commit.branch === versionControl.currentBranch;
}

async function approveCommit(commitId) {
    try {
        await versionControl.approveCommit(commitId);
        await loadPendingApprovals();
        await loadVersionHistory();
        alert('Commit approved successfully!');
    } catch (error) {
        alert(`Failed to approve commit: ${error.message}`);
    }
}

async function rejectCommit(commitId) {
    const reason = prompt('Please enter a reason for rejection:');
    if (!reason) return;
    
    try {
        await versionControl.rejectCommit(commitId, reason);
        await loadPendingApprovals();
        await loadVersionHistory();
        alert('Commit rejected successfully!');
    } catch (error) {
        alert(`Failed to reject commit: ${error.message}`);
    }
}

function showVersionTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.version-tab').forEach(tab => {
        tab.classList.add('hidden');
    });
    
    // Remove active class from all tab buttons
    document.querySelectorAll('.version-history-tabs .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    const tabId = tabName === 'commits' ? 'commitsTab' : 
                  tabName === 'pending' ? 'pendingTab' : 'conflictsTab';
    
    document.getElementById(tabId).classList.remove('hidden');
    
    // Add active class to clicked button
    event.target.classList.add('active');
}

function openBranchManager() {
    document.getElementById('branchManagerModal').classList.remove('hidden');
    loadBranches();
}

function closeBranchManager() {
    document.getElementById('branchManagerModal').classList.add('hidden');
}

function loadBranches() {
    const branches = versionControl.getBranches();
    const branchesList = document.getElementById('branchesList');
    
    let branchesHTML = '';
    branches.forEach(branch => {
        const isCurrent = branch.name === versionControl.currentBranch;
        const date = dayjs(branch.createdAt).format('MMM DD, YYYY');
        
        branchesHTML += `
            <div class="branch-item ${isCurrent ? 'current' : ''}">
                <div class="branch-info">
                    <div class="branch-name">${branch.name} ${isCurrent ? '(current)' : ''}</div>
                    <div class="branch-meta">Created by ${branch.createdBy} on ${date}</div>
                </div>
                <div class="branch-actions">
                    ${!isCurrent ? `<button class="btn btn--outline btn--sm" onclick="switchBranch('${branch.name}')">Switch</button>` : ''}
                    ${branch.name !== 'main' ? `<button class="btn btn--outline btn--sm" onclick="deleteBranch('${branch.name}')">Delete</button>` : ''}
                </div>
            </div>
        `;
    });
    
    branchesList.innerHTML = branchesHTML;
}

function createNewBranch() {
    // Populate parent branch options
    const branches = versionControl.getBranches();
    const parentBranchSelect = document.getElementById('parentBranch');
    parentBranchSelect.innerHTML = '';
    branches.forEach(branch => {
        parentBranchSelect.innerHTML += `<option value="${branch.name}">${branch.name}</option>`;
    });
    
    // Set current branch as default parent
    parentBranchSelect.value = versionControl.currentBranch;
    
    document.getElementById('createBranchModal').classList.remove('hidden');
}

function closeCreateBranch() {
    document.getElementById('createBranchModal').classList.add('hidden');
    document.getElementById('createBranchForm').reset();
}

function handleCreateBranch() {
    const branchName = document.getElementById('branchName').value.trim();
    const parentBranch = document.getElementById('parentBranch').value;
    
    if (!branchName) {
        alert('Please enter a branch name');
        return;
    }
    
    try {
        versionControl.createBranch(branchName, parentBranch, currentUser.username, new Date());
        closeCreateBranch();
        loadBranches();
        alert('Branch created successfully!');
    } catch (error) {
        alert(`Failed to create branch: ${error.message}`);
    }
}

function switchBranch(branchName) {
    try {
        versionControl.switchBranch(branchName);
        closeBranchManager();
        
        // Reload current page to reflect branch data
        showPage(currentPage);
        alert(`Switched to branch '${branchName}' successfully!`);
    } catch (error) {
        alert(`Failed to switch branch: ${error.message}`);
    }
}

function deleteBranch(branchName) {
    if (!confirm(`Are you sure you want to delete branch '${branchName}'?`)) {
        return;
    }
    
    const branches = versionControl.getBranches();
    const filteredBranches = branches.filter(b => b.name !== branchName);
    versionControl.saveBranches(filteredBranches);
    
    versionControl.auditLog('branch', `Deleted branch '${branchName}'`);
    loadBranches();
    alert('Branch deleted successfully!');
}

// ==================== PAGE NAVIGATION ====================

function showPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.add('hidden');
    });
    
    // Remove active class from all nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Show selected page
    const targetPage = document.getElementById(pageId + 'Page');
    const targetNav = document.getElementById('nav-' + pageId);
    
    if (targetPage) {
        targetPage.classList.remove('hidden');
    }
    if (targetNav) {
        targetNav.classList.add('active');
    }
    
    currentPage = pageId;
    
    // Load page-specific content
    switch(pageId) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'calendar':
            loadCalendar();
            break;
        case 'materials':
            loadMaterials();
            break;
        case 'users':
            loadUsers();
            break;
        case 'equipment':
            loadEquipment();
            break;
        case 'reports':
            loadReports();
            break;
        case 'audit':
            loadAuditLog();
            break;
        case 'settings':
            loadSettings();
            break;
    }
}

// ==================== DASHBOARD ====================

function loadDashboard() {
    updateDashboardStats();
    setTimeout(() => {
        createProductionChart();
    }, 100);
    updateAlerts();
}

function updateDashboardStats() {
    const today = new Date().toISOString().split('T')[0];
    const todaySchedule = appData.schedule[today] || {};
    const productionCount = Object.values(todaySchedule).filter(s => s.activity === 'Production').length;
    
    const activeEquipment = appData.equipment.filter(e => e.status === 'active').length;
    const totalEquipment = appData.equipment.length;
    
    const lowStockItems = getAllMaterials().filter(m => m.stock <= m.reorderLevel).length;
    
    // Update DOM elements safely
    const elements = {
        'todayProduction': `${productionCount} Batches`,
        'activeEquipment': `${activeEquipment} / ${totalEquipment}`,
        'lowStockItems': lowStockItems
    };
    
    Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    });
}

function createProductionChart() {
    const ctx = document.getElementById('productionChart');
    if (!ctx) return;
    
    if (charts.production) {
        charts.production.destroy();
    }
    
    const data = {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [{
            label: 'Batches Produced',
            data: [12, 15, 8, 18, 22, 14, 16],
            backgroundColor: '#1FB8CD',
            borderColor: '#1FB8CD',
            borderWidth: 2,
            fill: false
        }]
    };
    
    charts.production = new Chart(ctx, {
        type: 'line',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0,0,0,0.1)'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(0,0,0,0.1)'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

function updateAlerts() {
    const alertsList = document.getElementById('alertsList');
    if (!alertsList) return;
    
    const lowStockMaterials = getAllMaterials().filter(m => m.stock <= m.reorderLevel);
    const maintenanceEquipment = appData.equipment.filter(e => e.status === 'maintenance');
    
    let alertsHTML = '';
    
    lowStockMaterials.forEach(material => {
        alertsHTML += `
            <div class="alert alert--warning">
                <strong>Low Stock:</strong> ${material.name} below reorder level (${material.stock} remaining)
            </div>
        `;
    });
    
    maintenanceEquipment.forEach(equipment => {
        alertsHTML += `
            <div class="alert alert--info">
                <strong>Maintenance:</strong> ${equipment.name} currently under maintenance
            </div>
        `;
    });
    
    if (lowStockMaterials.length === 0 && maintenanceEquipment.length === 0) {
        alertsHTML = '<div class="alert alert--success"><strong>All systems operational!</strong> No critical alerts.</div>';
    }
    
    alertsList.innerHTML = alertsHTML;
}

// ==================== CALENDAR FUNCTIONS ====================

function loadCalendar() {
    generateCalendarGrid();
    updateMonthDisplay();
}

function generateCalendarGrid() {
    const calendarGrid = document.getElementById('calendarGrid');
    if (!calendarGrid) return;
    
    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    
    let gridHTML = '';
    
    // Header row
    gridHTML += '<div class="calendar-header">Equipment</div>';
    for (let day = 1; day <= daysInMonth; day++) {
        gridHTML += `<div class="calendar-header">${day}</div>`;
    }
    
    // Equipment rows
    appData.equipment.forEach(equipment => {
        gridHTML += `<div class="calendar-equipment">${equipment.name}</div>`;
        
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const schedule = appData.schedule[dateStr]?.[equipment.name];
            
            let cellClass = 'calendar-cell';
            let cellContent = '';
            
            if (schedule) {
                cellClass += ` ${schedule.activity.toLowerCase()}`;
                cellContent = `
                    <div class="calendar-cell-content">
                        <div class="batch-number">${schedule.batch || schedule.activity}</div>
                        <div class="product-name">${schedule.product}</div>
                    </div>
                `;
            }
            
            gridHTML += `
                <div class="${cellClass}" 
                     data-equipment="${equipment.name}" 
                     data-date="${dateStr}"
                     onclick="editSchedule('${equipment.name}', '${dateStr}')">
                    ${cellContent}
                </div>
            `;
        }
    });
    
    calendarGrid.innerHTML = gridHTML;
}

function updateMonthDisplay() {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    const currentMonthEl = document.getElementById('currentMonth');
    if (currentMonthEl) {
        currentMonthEl.textContent = `${monthNames[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;
    }
}

function previousMonth() {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    generateCalendarGrid();
    updateMonthDisplay();
}

function nextMonth() {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    generateCalendarGrid();
    updateMonthDisplay();
}

function editSchedule(equipment, date) {
    if (['Viewer'].includes(currentUser.role)) {
        alert('You do not have permission to edit schedules.');
        return;
    }
    
    editingCell = {equipment, date};
    const currentSchedule = appData.schedule[date]?.[equipment];
    
    if (currentSchedule) {
        document.getElementById('scheduleActivity').value = currentSchedule.activity;
        document.getElementById('scheduleBatch').value = currentSchedule.batch;
        document.getElementById('scheduleProduct').value = currentSchedule.product;
    } else {
        document.getElementById('scheduleActivity').value = 'Production';
        document.getElementById('scheduleBatch').value = '';
        document.getElementById('scheduleProduct').value = '';
    }
    
    toggleBatchProductFields();
    document.getElementById('scheduleModal').classList.remove('hidden');
}

function toggleBatchProductFields() {
    const activity = document.getElementById('scheduleActivity').value;
    const batchGroup = document.getElementById('batchGroup');
    const productGroup = document.getElementById('productGroup');
    
    if (activity === 'Production') {
        batchGroup.style.display = 'block';
        productGroup.style.display = 'block';
        document.getElementById('scheduleBatch').required = true;
        document.getElementById('scheduleProduct').required = true;
    } else {
        batchGroup.style.display = 'none';
        productGroup.style.display = 'none';
        document.getElementById('scheduleBatch').required = false;
        document.getElementById('scheduleProduct').required = false;
    }
}

function closeScheduleModal() {
    document.getElementById('scheduleModal').classList.add('hidden');
    editingCell = null;
}

function handleScheduleSubmit() {
    if (!editingCell) return;
    
    const activity = document.getElementById('scheduleActivity').value;
    const batch = document.getElementById('scheduleBatch').value;
    const product = document.getElementById('scheduleProduct').value;
    
    if (!appData.schedule[editingCell.date]) {
        appData.schedule[editingCell.date] = {};
    }
    
    appData.schedule[editingCell.date][editingCell.equipment] = {
        activity,
        batch: activity === 'Production' ? batch : '',
        product: activity === 'Production' ? product : ''
    };
    
    generateCalendarGrid();
    closeScheduleModal();
    saveAppData();
    
    versionControl.auditLog('schedule', `Updated schedule for ${editingCell.equipment} on ${editingCell.date}`);
    alert('Schedule updated successfully!');
}

function printCalendar() {
    window.print();
}

// ==================== DATA IMPORT/EXPORT ====================

function exportData(format) {
    if (format === 'csv') {
        exportCalendarCSV();
    } else if (format === 'json') {
        exportJSON();
    }
}

function exportCalendarCSV() {
    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    let csvContent = 'Equipment';
    
    // Header row
    for (let day = 1; day <= daysInMonth; day++) {
        csvContent += `,${day}`;
    }
    csvContent += '\n';
    
    // Data rows
    appData.equipment.forEach(equipment => {
        csvContent += equipment.name;
        
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const schedule = appData.schedule[dateStr]?.[equipment.name];
            
            if (schedule) {
                csvContent += `,"${schedule.activity} - ${schedule.batch} - ${schedule.product}"`;
            } else {
                csvContent += ',';
            }
        }
        csvContent += '\n';
    });
    
    downloadFile(csvContent, `production-calendar-${currentMonth.getFullYear()}-${currentMonth.getMonth() + 1}.csv`, 'text/csv');
}

function exportJSON() {
    const dataToExport = {
        exportDate: new Date().toISOString(),
        exportedBy: currentUser.username,
        branch: versionControl.currentBranch,
        data: appData
    };
    
    const jsonContent = JSON.stringify(dataToExport, null, 2);
    downloadFile(jsonContent, `manufacturing-data-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], {type: mimeType});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importData() {
    document.getElementById('importModal').classList.remove('hidden');
}

function closeImportModal() {
    document.getElementById('importModal').classList.add('hidden');
    document.getElementById('importForm').reset();
}

function handleImportSubmit() {
    const fileInput = document.getElementById('importFile');
    const importMode = document.querySelector('input[name="importMode"]:checked').value;
    const createBackup = document.getElementById('createBackup').checked;
    
    if (!fileInput.files[0]) {
        alert('Please select a file to import');
        return;
    }
    
    const file = fileInput.files[0];
    const reader = new FileReader();
    
    reader.onload = async function(e) {
        try {
            let importedData;
            
            if (file.name.endsWith('.json')) {
                const jsonData = JSON.parse(e.target.result);
                importedData = jsonData.data || jsonData;
            } else if (file.name.endsWith('.csv')) {
                // Simple CSV parsing - would need more sophisticated parsing for production
                alert('CSV import not yet implemented in demo');
                return;
            }
            
            // Create backup if requested
            if (createBackup) {
                await versionControl.commit(`Backup before import: ${file.name}`, false);
            }
            
            // Import data
            if (importMode === 'merge') {
                appData = { ...appData, ...importedData };
            } else {
                appData = { ...importedData };
            }
            
            saveAppData();
            closeImportModal();
            
            // Reload current page
            showPage(currentPage);
            
            versionControl.auditLog('import', `Imported data from ${file.name}`, { importMode, createBackup });
            alert('Data imported successfully!');
            
        } catch (error) {
            alert(`Failed to import data: ${error.message}`);
        }
    };
    
    reader.readAsText(file);
}

// ==================== MATERIALS MANAGEMENT ====================

function loadMaterials() {
    showMaterialTab('api');
}

function showMaterialTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.material-tab').forEach(tab => {
        tab.classList.add('hidden');
    });
    
    // Remove active class from all tab buttons
    document.querySelectorAll('.materials-tabs .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    const tabId = tabName === 'api' ? 'apiTab' : 
                  tabName === 'excipients' ? 'excipients' :
                  tabName === 'packaging' ? 'packagingTab' : 'procurementTab';
    
    const selectedTab = document.getElementById(tabId);
    if (selectedTab) {
        selectedTab.classList.remove('hidden');
    }
    
    // Add active class to the correct button
    const buttonMap = {
        'api': 'API',
        'excipients': 'Excipients', 
        'packaging': 'Packaging',
        'procurement': 'Procurement Plan'
    };
    
    const activeButton = Array.from(document.querySelectorAll('.materials-tabs .tab-btn')).find(btn => 
        btn.textContent.trim() === buttonMap[tabName]
    );
    if (activeButton) {
        activeButton.classList.add('active');
    }
    
    // Load tab content
    switch(tabName) {
        case 'api':
            loadMaterialGrid('api');
            break;
        case 'excipients':
            loadMaterialGrid('excipients');
            break;
        case 'packaging':
            loadMaterialGrid('packaging');
            break;
        case 'procurement':
            loadProcurementPlan();
            break;
    }
}

function loadMaterialGrid(type) {
    const materials = appData.materials[type];
    const gridId = type === 'api' ? 'apiGrid' : 
                   type === 'excipients' ? 'excipientGrid' : 'packagingGrid';
    const grid = document.getElementById(gridId);
    
    if (!grid || !materials) return;
    
    let gridHTML = '';
    
    materials.forEach((material, index) => {
        const stockStatus = material.stock <= material.reorderLevel ? 'low' : 'good';
        const stockLabel = stockStatus === 'low' ? 'Low Stock' : 'Good Stock';
        
        gridHTML += `
            <div class="material-card">
                <div class="material-header">
                    <h4 class="material-name">${material.name}</h4>
                    <span class="material-category">${material.category}</span>
                </div>
                <div class="material-stats">
                    <div class="material-stat">
                        <div class="material-stat-value">${material.stock}</div>
                        <div class="material-stat-label">Current Stock</div>
                    </div>
                    <div class="material-stat">
                        <div class="material-stat-value">${material.reorderLevel}</div>
                        <div class="material-stat-label">Reorder Level</div>
                    </div>
                </div>
                <div class="stock-status ${stockStatus}">${stockLabel}</div>
                <div class="material-actions" style="margin-top: 12px; display: flex; gap: 8px;">
                    <button class="btn btn--outline btn--sm" onclick="editMaterial('${type}', ${index})">Edit</button>
                    <button class="btn btn--outline btn--sm" onclick="updateStock('${type}', ${index})">Update Stock</button>
                </div>
            </div>
        `;
    });
    
    grid.innerHTML = gridHTML;
}

function getAllMaterials() {
    return [
        ...appData.materials.api,
        ...appData.materials.excipients,
        ...appData.materials.packaging
    ];
}

function addMaterial(type) {
    if (['Viewer'].includes(currentUser.role)) {
        alert('You do not have permission to add materials.');
        return;
    }
    
    document.getElementById('materialModalTitle').textContent = 'Add Material';
    document.getElementById('materialForm').reset();
    
    // Show/hide category field based on type
    const categoryGroup = document.getElementById('categoryGroup');
    if (type === 'excipients') {
        categoryGroup.style.display = 'block';
    } else {
        categoryGroup.style.display = 'none';
    }
    
    document.getElementById('materialModal').classList.remove('hidden');
    
    // Store the type for form submission
    document.getElementById('materialForm').dataset.type = type;
    document.getElementById('materialForm').dataset.index = '-1';
}

function editMaterial(type, index) {
    if (['Viewer'].includes(currentUser.role)) {
        alert('You do not have permission to edit materials.');
        return;
    }
    
    const material = appData.materials[type][index];
    
    document.getElementById('materialModalTitle').textContent = 'Edit Material';
    document.getElementById('materialName').value = material.name;
    document.getElementById('materialStock').value = material.stock;
    document.getElementById('materialReorderLevel').value = material.reorderLevel;
    document.getElementById('materialLeadTime').value = material.leadTime || 30;
    
    if (type === 'excipients') {
        document.getElementById('categoryGroup').style.display = 'block';
        document.getElementById('materialCategory').value = material.category;
    } else {
        document.getElementById('categoryGroup').style.display = 'none';
    }
    
    document.getElementById('materialModal').classList.remove('hidden');
    
    // Store the type and index for form submission
    document.getElementById('materialForm').dataset.type = type;
    document.getElementById('materialForm').dataset.index = index;
}

function updateStock(type, index) {
    if (['Viewer'].includes(currentUser.role)) {
        alert('You do not have permission to update stock.');
        return;
    }
    
    const material = appData.materials[type][index];
    const newStock = prompt(`Update stock for ${material.name}\nCurrent stock: ${material.stock}`, material.stock);
    
    if (newStock !== null && !isNaN(newStock) && newStock >= 0) {
        const oldStock = material.stock;
        appData.materials[type][index].stock = parseInt(newStock);
        loadMaterialGrid(type);
        updateDashboardStats();
        saveAppData();
        versionControl.auditLog('materials', `Updated stock for ${material.name}`, { oldStock, newStock: parseInt(newStock) });
    }
}

function closeMaterialModal() {
    document.getElementById('materialModal').classList.add('hidden');
}

function handleMaterialSubmit() {
    const form = document.getElementById('materialForm');
    const type = form.dataset.type;
    const index = parseInt(form.dataset.index);
    
    const materialData = {
        name: document.getElementById('materialName').value.trim(),
        stock: parseInt(document.getElementById('materialStock').value),
        reorderLevel: parseInt(document.getElementById('materialReorderLevel').value),
        leadTime: parseInt(document.getElementById('materialLeadTime').value),
        category: type === 'excipients' ? document.getElementById('materialCategory').value : type
    };
    
    if (!materialData.name) {
        alert('Please enter a material name');
        return;
    }
    
    if (index === -1) {
        // Add new material
        appData.materials[type].push(materialData);
        versionControl.auditLog('materials', `Added new material: ${materialData.name}`);
    } else {
        // Edit existing material
        const oldMaterial = appData.materials[type][index];
        appData.materials[type][index] = materialData;
        versionControl.auditLog('materials', `Updated material: ${materialData.name}`, { oldData: oldMaterial });
    }
    
    loadMaterialGrid(type);
    closeMaterialModal();
    updateDashboardStats();
    saveAppData();
    
    alert('Material saved successfully!');
}

function loadProcurementPlan() {
    const procurementContent = document.getElementById('procurementContent');
    if (!procurementContent) return;
    
    const lowStockMaterials = getAllMaterials().filter(m => m.stock <= m.reorderLevel);
    
    let contentHTML = '';
    
    if (lowStockMaterials.length === 0) {
        contentHTML = '<p>All materials are adequately stocked. No procurement required at this time.</p>';
    } else {
        lowStockMaterials.forEach(material => {
            const quantityNeeded = Math.max(material.reorderLevel * 2 - material.stock, 0);
            
            contentHTML += `
                <div class="procurement-item">
                    <div class="procurement-info">
                        <h4>${material.name}</h4>
                        <p>Current Stock: ${material.stock} | Reorder Level: ${material.reorderLevel} | Lead Time: ${material.leadTime} days</p>
                    </div>
                    <div class="procurement-action">
                        <div class="quantity-needed">${quantityNeeded} units needed</div>
                        <button class="btn btn--primary btn--sm" onclick="createPurchaseOrder('${material.name}', ${quantityNeeded})">Create PO</button>
                    </div>
                </div>
            `;
        });
    }
    
    procurementContent.innerHTML = contentHTML;
}

function generateProcurementPlan() {
    loadProcurementPlan();
}

function createPurchaseOrder(materialName, quantity) {
    versionControl.auditLog('procurement', `Created PO for ${materialName}`, { quantity });
    alert(`Purchase Order created for ${materialName} - Quantity: ${quantity} units`);
}

// ==================== USER MANAGEMENT ====================

function loadUsers() {
    if (!['Super Admin', 'Manager'].includes(currentUser.role)) {
        document.getElementById('usersGrid').innerHTML = '<p>You do not have permission to view user management.</p>';
        return;
    }
    
    const usersGrid = document.getElementById('usersGrid');
    if (!usersGrid) return;
    
    let gridHTML = '';
    
    appData.users.forEach((user, index) => {
        const canDelete = currentUser.role === 'Super Admin' || 
                         (currentUser.role === 'Manager' && !['Super Admin', 'Manager'].includes(user.role));
        
        gridHTML += `
            <div class="user-card">
                <div class="user-info">
                    <div class="user-name">${user.username}</div>
                    <div class="user-email">${user.email}</div>
                    <div class="status status--info">${user.role}</div>
                </div>
                <div class="user-actions">
                    <button class="btn btn--outline btn--sm" onclick="editUser(${index})">Edit</button>
                    ${canDelete ? `<button class="btn btn--outline btn--sm" onclick="deleteUser(${index})">Delete</button>` : ''}
                </div>
            </div>
        `;
    });
    
    usersGrid.innerHTML = gridHTML;
}

function addUser() {
    if (!['Super Admin', 'Manager'].includes(currentUser.role)) {
        alert('You do not have permission to add users.');
        return;
    }
    
    const username = prompt('Enter username:');
    if (!username) return;
    
    const email = prompt('Enter email:');
    if (!email) return;
    
    const availableRoles = currentUser.role === 'Super Admin' ? 
        ['Super Admin', 'Manager', 'Editor', 'Viewer'] : ['Editor', 'Viewer'];
    
    const role = prompt(`Enter role (${availableRoles.join('/')})`, 'Viewer');
    
    if (!availableRoles.includes(role)) {
        alert('Invalid role selected');
        return;
    }
    
    if (appData.users.find(u => u.username === username)) {
        alert('Username already exists');
        return;
    }
    
    const newUser = {
        id: appData.users.length + 1,
        username,
        email,
        role,
        defaultPassword: true
    };
    
    appData.users.push(newUser);
    loadUsers();
    saveAppData();
    versionControl.auditLog('user', `Added new user: ${username}`, { role });
}

function editUser(index) {
    const user = appData.users[index];
    const newEmail = prompt('Enter new email:', user.email);
    
    if (newEmail) {
        const oldEmail = user.email;
        appData.users[index].email = newEmail;
        
        if (currentUser.role === 'Super Admin') {
            const availableRoles = ['Super Admin', 'Manager', 'Editor', 'Viewer'];
            const newRole = prompt(`Enter new role (${availableRoles.join('/')})`, user.role);
            if (newRole && availableRoles.includes(newRole)) {
                appData.users[index].role = newRole;
            }
        }
        
        loadUsers();
        saveAppData();
        versionControl.auditLog('user', `Updated user: ${user.username}`, { oldEmail, newEmail });
    }
}

function deleteUser(index) {
    if (confirm('Are you sure you want to delete this user?')) {
        const user = appData.users[index];
        appData.users.splice(index, 1);
        loadUsers();
        saveAppData();
        versionControl.auditLog('user', `Deleted user: ${user.username}`);
    }
}

// ==================== EQUIPMENT MANAGEMENT ====================

function loadEquipment() {
    if (currentUser.role !== 'Super Admin') {
        document.getElementById('equipmentGrid').innerHTML = '<p>You do not have permission to manage equipment.</p>';
        return;
    }
    
    const equipmentGrid = document.getElementById('equipmentGrid');
    if (!equipmentGrid) return;
    
    let gridHTML = '';
    
    appData.equipment.forEach((equipment, index) => {
        gridHTML += `
            <div class="equipment-card">
                <div class="equipment-header">
                    <h4 class="equipment-name">${equipment.name}</h4>
                    <span class="equipment-type">${equipment.type}</span>
                </div>
                <div class="equipment-capacity">Capacity: ${equipment.capacity}</div>
                <div class="equipment-status ${equipment.status}">${equipment.status.charAt(0).toUpperCase() + equipment.status.slice(1)}</div>
                <div class="equipment-actions" style="display: flex; gap: 8px;">
                    <button class="btn btn--outline btn--sm" onclick="editEquipment(${index})">Edit</button>
                    <button class="btn btn--outline btn--sm" onclick="deleteEquipment(${index})">Delete</button>
                </div>
            </div>
        `;
    });
    
    equipmentGrid.innerHTML = gridHTML;
}

function addEquipment() {
    if (currentUser.role !== 'Super Admin') {
        alert('You do not have permission to add equipment.');
        return;
    }
    
    const name = prompt('Enter equipment name:');
    if (!name) return;
    
    const type = prompt('Enter equipment type:');
    if (!type) return;
    
    const capacity = prompt('Enter capacity:');
    if (!capacity) return;
    
    const newEquipment = {
        name,
        type,
        capacity,
        status: 'active'
    };
    
    appData.equipment.push(newEquipment);
    loadEquipment();
    saveAppData();
    versionControl.auditLog('equipment', `Added new equipment: ${name}`);
}

function editEquipment(index) {
    const equipment = appData.equipment[index];
    const newName = prompt('Enter equipment name:', equipment.name);
    if (!newName) return;
    
    const newCapacity = prompt('Enter capacity:', equipment.capacity);
    if (!newCapacity) return;
    
    const newStatus = prompt('Enter status (active/maintenance):', equipment.status);
    if (!newStatus || !['active', 'maintenance'].includes(newStatus)) return;
    
    const oldEquipment = { ...equipment };
    appData.equipment[index] = {
        ...equipment,
        name: newName,
        capacity: newCapacity,
        status: newStatus
    };
    
    loadEquipment();
    updateDashboardStats();
    saveAppData();
    versionControl.auditLog('equipment', `Updated equipment: ${newName}`, { oldData: oldEquipment });
}

function deleteEquipment(index) {
    if (confirm('Are you sure you want to delete this equipment?')) {
        const equipment = appData.equipment[index];
        appData.equipment.splice(index, 1);
        loadEquipment();
        updateDashboardStats();
        saveAppData();
        versionControl.auditLog('equipment', `Deleted equipment: ${equipment.name}`);
    }
}

// ==================== REPORTS ====================

function loadReports() {
    setTimeout(() => {
        createProductionReportChart();
        createEquipmentUtilizationChart();
    }, 100);
}

function createProductionReportChart() {
    const ctx = document.getElementById('productionReportChart');
    if (!ctx) return;
    
    if (charts.productionReport) {
        charts.productionReport.destroy();
    }
    
    const data = {
        labels: ['Pantoprazole', 'Atorvastatin', 'Clopidogrel', 'Trazodone', 'Others'],
        datasets: [{
            data: [30, 25, 20, 15, 10],
            backgroundColor: ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F']
        }]
    };
    
    charts.productionReport = new Chart(ctx, {
        type: 'doughnut',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function createEquipmentUtilizationChart() {
    const ctx = document.getElementById('equipmentUtilizationChart');
    if (!ctx) return;
    
    if (charts.equipmentUtilization) {
        charts.equipmentUtilization.destroy();
    }
    
    const data = {
        labels: appData.equipment.map(e => e.name),
        datasets: [{
            label: 'Utilization %',
            data: [85, 92, 78, 0, 88, 76, 94, 82, 90],
            backgroundColor: '#1FB8CD'
        }]
    };
    
    charts.equipmentUtilization = new Chart(ctx, {
        type: 'bar',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

// ==================== AUDIT LOG ====================

function loadAuditLog() {
    if (!['Super Admin', 'Manager'].includes(currentUser.role)) {
        document.getElementById('auditContainer').innerHTML = '<p>You do not have permission to view audit logs.</p>';
        return;
    }
    
    displayAuditLog();
}

function displayAuditLog(filter = 'all') {
    const auditLog = JSON.parse(localStorage.getItem('auditLog') || '[]');
    const auditContainer = document.getElementById('auditContainer');
    if (!auditContainer) return;
    
    let filteredLog = auditLog;
    if (filter !== 'all') {
        filteredLog = auditLog.filter(entry => entry.action === filter);
    }
    
    let logHTML = '';
    filteredLog.slice(0, 100).forEach(entry => { // Show only last 100 entries
        const date = dayjs(entry.timestamp).format('MMM DD, YYYY HH:mm:ss');
        const iconMap = {
            'commit': '💾',
            'branch': '🌿',
            'merge': '🔀',
            'approval': '✅',
            'conflict': '⚠️',
            'user': '👤',
            'materials': '📦',
            'equipment': '⚙️',
            'schedule': '📅',
            'procurement': '🛒',
            'import': '📥'
        };
        
        logHTML += `
            <div class="audit-item">
                <div class="audit-icon">${iconMap[entry.action] || '📝'}</div>
                <div class="audit-content">
                    <div class="audit-action">${entry.description}</div>
                    <div class="audit-meta">
                        <span>By ${entry.user}</span>
                        <span>${date}</span>
                        <span>Branch: ${entry.branch}</span>
                    </div>
                    ${entry.details && Object.keys(entry.details).length > 0 ? 
                        `<div class="audit-details">Details: ${JSON.stringify(entry.details)}</div>` : ''}
                </div>
            </div>
        `;
    });
    
    auditContainer.innerHTML = logHTML || '<p>No audit entries found.</p>';
}

function filterAuditLog() {
    const filter = document.getElementById('auditFilter').value;
    displayAuditLog(filter);
}

function exportAuditLog() {
    const auditLog = JSON.parse(localStorage.getItem('auditLog') || '[]');
    const csvContent = [
        'Timestamp,User,Action,Description,Branch,Details',
        ...auditLog.map(entry => 
            `"${entry.timestamp}","${entry.user}","${entry.action}","${entry.description}","${entry.branch}","${JSON.stringify(entry.details)}"`
        )
    ].join('\n');
    
    downloadFile(csvContent, `audit-log-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
}

// ==================== SETTINGS ====================

function loadSettings() {
    if (!['Super Admin', 'Manager'].includes(currentUser.role)) {
        document.getElementById('settingsPage').innerHTML = '<h2>Settings</h2><p>You do not have permission to access settings.</p>';
        return;
    }
    
    // Load company settings
    const companyNameField = document.getElementById('settingsCompanyName');
    if (companyNameField) {
        companyNameField.value = appData.companySettings.name;
    }
    
    // Load version control settings
    const settings = versionControl.getVersionSettings();
    document.getElementById('autoCommitEnabled').checked = settings.autoCommitEnabled;
    document.getElementById('requireApprovalForCommits').checked = settings.requireApprovalForCommits;
    document.getElementById('autoCommitInterval').value = settings.autoCommitInterval;
}

function saveCompanySettings() {
    const newName = document.getElementById('settingsCompanyName').value.trim();
    if (!newName) {
        alert('Please enter a company name');
        return;
    }
    
    appData.companySettings.name = newName;
    
    document.getElementById('appCompanyName').textContent = newName;
    document.getElementById('companyName').textContent = newName;
    
    saveAppData();
    versionControl.auditLog('settings', 'Updated company settings');
    alert('Company settings saved successfully!');
}

function updateVersionSettings() {
    const settings = {
        autoCommitEnabled: document.getElementById('autoCommitEnabled').checked,
        requireApprovalForCommits: document.getElementById('requireApprovalForCommits').checked,
        autoCommitInterval: parseInt(document.getElementById('autoCommitInterval').value)
    };
    
    versionControl.saveVersionSettings(settings);
    versionControl.auditLog('settings', 'Updated version control settings', settings);
    alert('Version control settings updated successfully!');
}

function uploadLogo(event) {
    const file = event.target.files[0];
    if (file) {
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            alert('Logo file size must be less than 5MB');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            appData.companySettings.logo = e.target.result;
            document.getElementById('appLogo').src = e.target.result;
            document.getElementById('companyLogo').src = e.target.result;
            saveAppData();
            versionControl.auditLog('settings', 'Updated company logo');
        };
        reader.readAsDataURL(file);
    }
}

// ==================== THEME MANAGEMENT ====================

function toggleTheme() {
    const currentTheme = localStorage.getItem('theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    versionControl.auditLog('settings', `Changed theme to ${newTheme}`);
}

function applyTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
}

// ==================== APPLICATION INITIALIZATION ====================

// Auto-save functionality
setInterval(() => {
    if (currentUser) {
        saveAppData();
    }
}, 30000); // Auto-save every 30 seconds

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing app...');
    initApp();
});