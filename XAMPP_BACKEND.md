# Boster Bost XAMPP Backend

The app is configured to use the XAMPP/MariaDB database through `.env.local`.

## Database

- Database name: `boster_bost`
- Host: `127.0.0.1`
- Port: `3306`
- User: `root`
- Password: empty by default

## Import in phpMyAdmin

1. Open XAMPP Control Panel and start Apache and MySQL.
2. Open `http://localhost/phpmyadmin`.
3. Click Import.
4. Choose `xampp-boster-bost-schema.sql`.
5. Click Go.

The SQL file creates:

- `users`
- `sessions`
- `orders`
- `wallet_transactions`
- `support_tickets`
- `support_messages`

## Backend Mode

The local app reads `.env.local`:

```env
DATABASE_PROVIDER=mysql
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=boster_bost
```

Visit `/api/backend/status` to confirm the app is using:

```json
{ "mode": "xampp-mysql" }
```

Admin access is controlled by `is_admin` and `access_level`. Authorized staff can manage orders, users, wallet records, and support conversations at `/admin`.

## Email Confirmation

Registration sends confirmation emails when SMTP is configured in `.env.local`.

```env
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM="Boster Bost <your-email@gmail.com>"
```

For Gmail, create an App Password in your Google account security settings. Normal Gmail passwords usually fail. If SMTP fields are empty, the app keeps a local confirmation link for development only.

See `EMAIL_CONFIRMATION_SETUP.md` for Brevo, Resend, and Gmail setup examples.
