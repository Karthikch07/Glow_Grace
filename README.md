# GlowGrace

GlowGrace is a modern eCommerce platform designed for luxury beauty and wellness businesses. It combines traditional online shopping with service booking capabilities, allowing customers to both purchase products and schedule appointments through a single, elegant interface.

## Overview

The platform serves two main purposes. First, it functions as an online store where customers can browse premium beauty products, add them to their cart, and complete purchases. Second, it works as a booking system for services like spa treatments, salon appointments, personal training sessions, and medical aesthetics procedures.

Built with modern web technologies, GlowGrace emphasizes user experience with a clean, luxury-focused design. The interface uses a burgundy and gold color scheme that conveys elegance while remaining accessible and easy to navigate.

## Key Capabilities

**Product Shopping Experience**
Customers can explore a curated collection of beauty and skincare products. Each product page includes detailed descriptions, pricing information, and high-quality images. The shopping cart updates in real-time as customers add or remove items, and the checkout process is streamlined to minimize friction.

**Service Appointment Booking**
The booking system allows customers to browse available services across multiple categories including spa, salon, fitness, and medical aesthetics. They can select their preferred date and time, choose specific service providers when applicable, and receive confirmation of their appointments.

**Payment Processing**
We've implemented UPI QR code payments as the primary payment method. After completing their order or booking, customers receive a QR code that they can scan using popular payment apps like PhonePe, Google Pay, or Paytm. They then verify the payment by entering their transaction ID or uploading a screenshot, which our system uses to confirm and process the order.

**Account Management**
Registered users can view their order history, track upcoming appointments, and manage their profile information. The authentication system uses JWT tokens for security while maintaining a smooth user experience.

**Staff Dashboard (`/admin`)**
Accounts whose email is listed in `ADMIN_EMAILS` (comma-separated, in `.env`) see an **Admin** link in the header. The dashboard has:

- **Overview**: sales, orders and appointments for the last 30 days compared with the 30 before, a 14-day sales chart, today's appointments, UPI payments waiting to be verified, and low-stock alerts.
- **Orders**: search and filter, verify UPI references, move orders through placed → confirmed → shipped → delivered, cancel (reserved stock is released), record refunds, and add notes to the order history.
- **Appointments**: filter by date or status, verify payments, record pay-at-salon payments, confirm, complete or cancel (cancelling frees the slot).
- **Inventory**: set or adjust stock per product. Prices stay in `shared/catalog.ts`.
- **Activity**: an audit log of every change staff make, with who made it and when.

Access is enforced by the server on every `/api/admin/*` request; the header link is only a convenience. After changing `ADMIN_EMAILS`, restart the server and sign in again.

Run `npm test` for the unit tests and `npm run check` for the type check.

