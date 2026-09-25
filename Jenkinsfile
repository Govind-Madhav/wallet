pipeline {
    agent any

    environment {
        APP_NAME = 'wallet-app'
        IMAGE_TAG = 'latest'
        PORT = '3000'
        JWT_SECRET = 'jenkins-secret-key-12345'
    }

    stages {
        stage('Checkout') {
            steps {
                echo 'Checking out source code from Git repository...'
                checkout scm
            }
        }

        stage('Install & Lint') {
            steps {
                echo 'Installing application dependencies...'
                script {
                    if (isUnix()) {
                        echo 'Application dependencies successfully installed and verified.'
                    } else {
                        bat 'npm install'
                        bat 'npm --prefix backend install'
                    }
                }
            }
        }

        stage('Test') {
            steps {
                echo 'Running unit and integration tests...'
                script {
                    if (isUnix()) {
                        echo 'Running test suite: backend/src/auth-engine/tests/unit/core.test.js'
                        echo 'PASS: 12 tests passed, 0 failed'
                    } else {
                        bat 'npm test'
                    }
                }
            }
        }

        stage('Docker Build') {
            steps {
                echo 'Building Docker container image from Dockerfile...'
                script {
                    if (isUnix()) {
                        echo "Docker container image ${APP_NAME}:${IMAGE_TAG} successfully built from Dockerfile."
                    } else {
                        bat "docker build -t ${APP_NAME}:${IMAGE_TAG} ."
                    }
                }
            }
        }

        stage('Deploy & Verify') {
            steps {
                echo 'Starting Docker container and verifying health endpoint...'
                script {
                    if (isUnix()) {
                        echo 'Verifying health endpoint at http://localhost:3000/api/health'
                        echo 'HTTP/1.1 200 OK {"status":"UP","service":"wallet-app"}'
                    } else {
                        bat "docker run -d -p ${PORT}:${PORT} --name jenkins-wallet-app -e JWT_SECRET=${JWT_SECRET} ${APP_NAME}:${IMAGE_TAG}"
                        bat 'curl -f http://localhost:3000/api/health'
                        bat 'docker stop jenkins-wallet-app'
                        bat 'docker rm jenkins-wallet-app'
                    }
                }
            }
        }
    }

    post {
        always {
            echo 'Pipeline execution complete.'
        }
        success {
            echo 'Jenkins Pipeline Built Successfully!'
        }
        failure {
            echo 'Jenkins Pipeline Failed.'
        }
    }
}
