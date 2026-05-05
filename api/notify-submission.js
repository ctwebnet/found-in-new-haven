import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL || "Lost in New Haven <onboarding@resend.dev>";
const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderHtml(submission) {
  const photoMarkup = Array.isArray(submission.photoUrls) && submission.photoUrls.length
    ? `<p><strong>Photos:</strong></p><ul>${submission.photoUrls
        .map(
          (photoUrl) =>
            `<li><a href="${escapeHtml(photoUrl)}">${escapeHtml(photoUrl)}</a></li>`
        )
        .join("")}</ul>`
    : "<p><strong>Photos:</strong> No photo URLs provided</p>";
  const linksMarkup = Array.isArray(submission.links) && submission.links.length
    ? `<p><strong>Links:</strong></p><ul>${submission.links
        .map((link) => `<li><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></li>`)
        .join("")}</ul>`
    : "<p><strong>Links:</strong> None provided</p>";

  return `
    <div style="font-family: Georgia, 'Times New Roman', serif; color: #1f1c19; line-height: 1.5;">
      <h1 style="font-size: 24px; margin-bottom: 16px;">New museum donation submission</h1>
      <p>A new Lost in New Haven donation has been submitted for review.</p>
      <hr style="border: none; border-top: 1px solid #ddd4c6; margin: 20px 0;" />
      <p><strong>Title:</strong> ${escapeHtml(submission.title)}</p>
      <p><strong>Category:</strong> ${escapeHtml(submission.category)}</p>
      <p><strong>Description:</strong><br />${escapeHtml(submission.description).replaceAll("\n", "<br />")}</p>
      <p><strong>Notes:</strong><br />${escapeHtml(submission.notes || "None provided").replaceAll("\n", "<br />")}</p>
      <p><strong>Donor:</strong> ${escapeHtml(submission.donorName)}</p>
      <p><strong>Donor email:</strong> ${escapeHtml(submission.donorEmail)}</p>
      <p><strong>Neighborhood:</strong> ${escapeHtml(submission.neighborhood || "Not provided")}</p>
      <p><strong>Estimated date:</strong> ${escapeHtml(submission.estimatedDate || "Not provided")}</p>
      <p><strong>Donation ID:</strong> ${escapeHtml(submission.donationId)}</p>
      ${photoMarkup}
      ${linksMarkup}
    </div>
  `;
}

function renderText(submission) {
  return [
    "New museum donation submission",
    "",
    `Title: ${submission.title}`,
    `Category: ${submission.category}`,
    `Description: ${submission.description}`,
    `Notes: ${submission.notes || "None provided"}`,
    `Donor: ${submission.donorName}`,
    `Donor email: ${submission.donorEmail}`,
    `Neighborhood: ${submission.neighborhood || "Not provided"}`,
    `Estimated date: ${submission.estimatedDate || "Not provided"}`,
    `Donation ID: ${submission.donationId}`,
    `Photos: ${
      Array.isArray(submission.photoUrls) && submission.photoUrls.length
        ? submission.photoUrls.join(", ")
        : "No photo URLs provided"
    }`,
    `Links: ${
      Array.isArray(submission.links) && submission.links.length
        ? submission.links.join(", ")
        : "None provided"
    }`,
  ].join("\n");
}

export async function POST(request) {
  if (!resendApiKey) {
    return Response.json({ error: "RESEND_API_KEY is not configured." }, { status: 500 });
  }

  if (!adminEmail) {
    return Response.json(
      { error: "ADMIN_NOTIFICATION_EMAIL is not configured." },
      { status: 500 }
    );
  }

  const submission = await request.json();
  const resend = new Resend(resendApiKey);

  const { error } = await resend.emails.send({
    from: fromEmail,
    to: [adminEmail],
    subject: `New donation: ${submission.title}`,
    html: renderHtml(submission),
    text: renderText(submission),
    replyTo: submission.donorEmail || undefined,
  });

  if (error) {
    return Response.json({ error: error.message || "Could not send email." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
