variable "container_name" {
  type        = string
  default     = "wallet-terraform-container"
  description = "Name of the Docker container provisioned by Terraform"
}

variable "external_port" {
  type        = number
  default     = 3000
  description = "Host port mapped to the application container"
}

variable "internal_port" {
  type        = number
  default     = 3000
  description = "Internal container port exposed by Express application"
}
