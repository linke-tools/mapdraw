CREATE TABLE projects (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    lat DECIMAL(10,8) DEFAULT 0,
    lng DECIMAL(11,8) DEFAULT 0,
    zoom INT DEFAULT 2,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE drawings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id CHAR(36),
    path JSON NOT NULL,
    color VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE active_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id CHAR(36),
    session_id CHAR(36),
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id)
); 
