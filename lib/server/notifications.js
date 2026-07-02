import { listUsersWithOrderCounts } from "./db";
import {
  buildDashboardUrl,
  sendSupportCustomerReplyEmail,
  sendSupportTicketReceivedEmail,
  sendSupportTicketUpdatedEmail,
} from "./email";

const supportAdminLevels = new Set(["support", "manager", "owner"]);

const supportAdmins = async () => {
  const users = await listUsersWithOrderCounts();
  return users.filter(
    (user) => user.isAdmin && (user.accessLevels || []).some((level) => supportAdminLevels.has(level)) && user.email
  );
};

export const notifyCustomerTicketReceived = async (requestUrl, { customer, ticket }) => {
  if (!customer?.email) return [];
  return Promise.allSettled([
    sendSupportTicketReceivedEmail({
      to: customer.email,
      name: customer.name,
      dashboardUrl: buildDashboardUrl(requestUrl, "/dashboard/support"),
      ticket,
    }),
  ]);
};

export const notifyCustomerTicketUpdated = async (requestUrl, { ticket, reply }) => {
  if (!ticket?.customerEmail) return [];
  return Promise.allSettled([
    sendSupportTicketUpdatedEmail({
      to: ticket.customerEmail,
      name: ticket.customerName,
      dashboardUrl: buildDashboardUrl(requestUrl, "/dashboard/support"),
      ticket,
      reply,
    }),
  ]);
};

export const notifyAdminsCustomerReplied = async (requestUrl, { ticket, reply }) => {
  const admins = await supportAdmins();
  if (!admins.length) return [];

  return Promise.allSettled(
    admins.map((admin) =>
      sendSupportCustomerReplyEmail({
        to: admin.email,
        name: admin.name,
        dashboardUrl: buildDashboardUrl(requestUrl, "/admin"),
        ticket,
        reply,
      })
    )
  );
};
