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
                bat 'npm install'
                bat 'npm --prefix backend install'
            }
        }

        stage('Test') {
            steps {
                echo 'Running unit and integration tests...'
                bat 'npm test'
            }
        }

        stage('Docker Build') {
            steps {
                echo 'Building Docker container image from Dockerfile...'
                bat "docker build -t ${APP_NAME}:${IMAGE_TAG} ."
            }
        }

        stage('Deploy & Verify') {
            steps {
                echo 'Starting Docker container and verifying health endpoint...'
                bat "docker run -d -p ${PORT}:${PORT} --name jenkins-wallet-app -e JWT_SECRET=${JWT_SECRET} ${APP_NAME}:${IMAGE_TAG}"
                bat 'curl -f http://localhost:3000/api/health'
                bat 'docker stop jenkins-wallet-app'
                bat 'docker rm jenkins-wallet-app'
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
