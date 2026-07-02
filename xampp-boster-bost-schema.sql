CREATE DATABASE IF NOT EXISTS `boster_bost` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `boster_bost`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(64) PRIMARY KEY,
  `name` VARCHAR(160) NOT NULL,
  `email` VARCHAR(190) NOT NULL UNIQUE,
  `role` VARCHAR(40) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `wallet` DECIMAL(18,4) NOT NULL DEFAULT 0,
  `is_admin` TINYINT(1) NOT NULL DEFAULT 0,
  `access_level` VARCHAR(160) NOT NULL DEFAULT 'customer',
  `email_verified` TINYINT(1) NOT NULL DEFAULT 0,
  `email_verified_at` VARCHAR(40),
  `verification_token` VARCHAR(120),
  `password_reset_token` VARCHAR(120),
  `password_reset_expires_at` VARCHAR(40),
  `created_at` VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sessions` (
  `id` VARCHAR(64) PRIMARY KEY,
  `user_id` VARCHAR(64) NOT NULL,
  `created_at` VARCHAR(40) NOT NULL,
  `expires_at` VARCHAR(40) NOT NULL,
  INDEX `idx_sessions_user_id` (`user_id`),
  CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `orders` (
  `id` VARCHAR(64) PRIMARY KEY,
  `order_code` VARCHAR(40) NOT NULL UNIQUE,
  `user_id` VARCHAR(64) NOT NULL,
  `platform` VARCHAR(120) NOT NULL,
  `service` TEXT NOT NULL,
  `package_type` VARCHAR(80) NOT NULL,
  `quantity` INT NOT NULL,
  `target_link` TEXT NOT NULL,
  `delivery_mode` VARCHAR(80) NOT NULL,
  `notes` TEXT,
  `rate` DECIMAL(18,4) NOT NULL,
  `cost` DECIMAL(18,4) NOT NULL,
  `status` VARCHAR(40) NOT NULL,
  `created_at` VARCHAR(40) NOT NULL,
  `updated_at` VARCHAR(40),
  INDEX `idx_orders_user_id` (`user_id`),
  CONSTRAINT `fk_orders_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `wallet_transactions` (
  `id` VARCHAR(64) PRIMARY KEY,
  `user_id` VARCHAR(64) NOT NULL,
  `type` VARCHAR(40) NOT NULL,
  `amount_rwf` DECIMAL(18,4) NOT NULL,
  `original_amount` DECIMAL(18,4),
  `original_currency` VARCHAR(10),
  `description` TEXT,
  `created_at` VARCHAR(40) NOT NULL,
  INDEX `idx_wallet_transactions_user_id` (`user_id`),
  CONSTRAINT `fk_wallet_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payment_deposits` (
  `id` VARCHAR(64) PRIMARY KEY,
  `user_id` VARCHAR(64) NOT NULL,
  `provider` VARCHAR(40) NOT NULL,
  `provider_deposit_id` VARCHAR(80) NOT NULL UNIQUE,
  `status` VARCHAR(40) NOT NULL,
  `amount_rwf` DECIMAL(18,4) NOT NULL,
  `original_amount` DECIMAL(18,4) NOT NULL,
  `original_currency` VARCHAR(10) NOT NULL,
  `payer_phone` VARCHAR(40),
  `payer_provider` VARCHAR(80),
  `provider_response` JSON,
  `created_at` VARCHAR(40) NOT NULL,
  `updated_at` VARCHAR(40) NOT NULL,
  INDEX `idx_payment_deposits_user_id` (`user_id`),
  CONSTRAINT `fk_payment_deposits_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `support_tickets` (
  `id` VARCHAR(64) PRIMARY KEY,
  `ticket_code` VARCHAR(40) NOT NULL UNIQUE,
  `user_id` VARCHAR(64) NOT NULL,
  `order_id` VARCHAR(80),
  `subject` VARCHAR(220) NOT NULL,
  `category` VARCHAR(80) NOT NULL,
  `status` VARCHAR(40) NOT NULL,
  `priority` VARCHAR(40) NOT NULL,
  `created_at` VARCHAR(40) NOT NULL,
  `updated_at` VARCHAR(40),
  INDEX `idx_support_tickets_user_id` (`user_id`),
  CONSTRAINT `fk_support_tickets_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `support_messages` (
  `id` VARCHAR(64) PRIMARY KEY,
  `ticket_id` VARCHAR(64) NOT NULL,
  `sender_user_id` VARCHAR(64) NOT NULL,
  `sender_role` VARCHAR(20) NOT NULL,
  `message` TEXT NOT NULL,
  `attachment_name` VARCHAR(255),
  `attachment_type` VARCHAR(120),
  `attachment_data` LONGTEXT,
  `created_at` VARCHAR(40) NOT NULL,
  INDEX `idx_support_messages_ticket_id` (`ticket_id`),
  CONSTRAINT `fk_support_messages_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_support_messages_user` FOREIGN KEY (`sender_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
