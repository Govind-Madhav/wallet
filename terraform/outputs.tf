output "container_id" {
  value       = null_resource.wallet_container.id
  description = "Unique ID of the Terraform-managed null resource for the wallet container"
}

output "container_name" {
  value       = null_resource.wallet_container.triggers.container_name
  description = "Name of the Docker container provisioned by Terraform"
}

output "application_url" {
  value       = "http://localhost:${var.external_port}"
  description = "URL to access the running wallet application"
}

output "health_check_url" {
  value       = "http://localhost:${var.external_port}/api/health"
  description = "URL to check health status of the provisioned application"
}
