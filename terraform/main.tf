terraform {
  required_version = ">= 1.0.0"
  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2.0"
    }
  }
}

# Provision and manage the application container via local-exec provisioner
resource "null_resource" "wallet_container" {
  triggers = {
    container_name = var.container_name
    image_name     = "wallet-app:latest"
    external_port  = var.external_port
  }

  provisioner "local-exec" {
    command = "docker run -d -p ${var.external_port}:${var.internal_port} --name ${var.container_name} -e NODE_ENV=production -e JWT_SECRET=terraform-secret-key-998877 wallet-app:latest"
  }

  provisioner "local-exec" {
    when    = destroy
    command = "docker stop ${self.triggers.container_name} && docker rm ${self.triggers.container_name}"
  }
}
