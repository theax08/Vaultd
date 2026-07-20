// Menu d'aide automatique du chat support : categories -> questions ->
// reponse canned. "Other" (a n'importe quel niveau) bascule vers le champ
// libre, qui devient une vraie demande envoyee a l'equipe Vaultd.
export const SUPPORT_CATEGORIES = [
  {
    key: "waitlist",
    label: "Waitlists",
    questions: [
      {
        question: "How do I create my first drop?",
        answer:
          "Go to Drops and click \"Create drop\". Pick the products, a start time, and save — your drop starts in DRAFT and you can edit it anytime before it goes LIVE.",
      },
      {
        question: "Can I limit the waitlist size?",
        answer:
          "Yes, set a max waitlist size when creating or editing a drop (Growth plan and above). Leave it empty for no limit.",
      },
      {
        question: "How do referrals affect a customer's waitlist position?",
        answer:
          "When referrals are enabled on a drop, each confirmed referral adds points to the referrer's score. Scores are used to sort the queue — the higher the score, the closer to the front. You set how many points each successful referral gives in the drop settings. This works on every plan; the automated \"your rank moved up\" email that notifies customers requires the Pro plan or above.",
      },
      {
        question: "How do I see who unsubscribed from a waitlist?",
        answer:
          "On the Waitlists page, open a queue and look for the \"Unsubscribed\" count at the top. The table shows each entry's status — unsubscribed entries are greyed out and excluded from automated emails.",
      },
    ],
  },
  {
    key: "emails",
    label: "Emails",
    questions: [
      {
        question: "How do waitlist emails work?",
        answer:
          "Go to Emails, link an automation to a drop using its Drop ID, and customize the subject/body. The instant confirmation email sends automatically as soon as someone joins the waitlist. Rank-update, drop-live, and drop-ended emails require the Pro plan or above.",
      },
      {
        question: "Which plan do I need for automated emails?",
        answer:
          "Growth includes the instant waitlist confirmation email. Pro and above unlock the full set: rank-update (referral position changes), drop-is-live, and drop-ended emails — all customizable with your brand, logo, and CTA links.",
      },
      {
        question: "Why can't I link an automation to an ended drop?",
        answer:
          "Once a drop is ENDED, its email automations are locked to keep the historical record consistent. Create or pick an active/upcoming drop instead.",
      },
      {
        question: "How do I customize the email design?",
        answer:
          "In the Emails section, select your automation and edit the subject, body, brand color, and CTA button. You can also upload your store logo — it appears at the top of every email sent for that automation.",
      },
    ],
  },
  {
    key: "drops",
    label: "Drops",
    questions: [
      {
        question: "How many drops can I run per month?",
        answer:
          "It depends on your plan — check Plans for the exact quota. Scale and Elite have no monthly cap.",
      },
      {
        question: "Why is my drop's unit limit lower than my actual stock?",
        answer:
          "Your plan caps the maximum units per drop regardless of real inventory. Upgrade your plan to raise that cap.",
      },
      {
        question: "How do I schedule a drop to launch automatically?",
        answer:
          "When creating or editing a drop, set a start date and time and toggle on \"Auto-launch\". Vaultd will switch the drop to LIVE at that exact time. Auto-launch requires the Scale plan or above.",
      },
      {
        question: "Does Vaultd stop sales once my unit limit is reached?",
        answer:
          "No. Vaultd tracks sales and records the sold-out moment, but it does not modify your Shopify inventory. Your store can still accept new orders after the unit limit is hit. If you need to prevent additional purchases, go to your Shopify admin and set the relevant product variants to \"out of stock\", or configure Shopify's inventory policy to cap the available quantity. Vaultd will close the drop and record the correct analytics based on orders received up to that point.",
      },
    ],
  },
  {
    key: "analytics",
    label: "Drop history & analytics",
    questions: [
      {
        question: "How do I read the hourly heatmap in Drop History?",
        answer:
          "The heatmap shows when orders came in during your drop. Each bar is a time window — taller bar means more items sold in that period. Use \"5 min\" for an overview of the whole drop, or \"5 sec\" to zoom into the rush and see exactly when demand peaked. Scroll horizontally to explore long drops. The tallest bar is your peak demand moment. If bars are concentrated at the start, the drop sold out fast (well-primed audience). If they're spread evenly, demand was steady throughout. Gaps between bars are lulls with no orders.",
      },
      {
        question: "How does the comparison with the previous drop work?",
        answer:
          "Drop History compares each metric (revenue, conversion rate, avg cart size) against your most recent ended drop. A green arrow means improvement, red means decline. If this is your first ended drop, comparisons show \"N/A\" — they'll appear automatically once you have a second drop to compare against.",
      },
      {
        question: "Why are my traffic source numbers low or showing 'other'?",
        answer:
          "Traffic sources (Instagram, TikTok, Vaultd Emails, etc.) are tracked by the Vaultd waitlist widget embedded on your storefront page. Each time a visitor loads the page, the widget reads the ?vaultd_src= URL parameter and records the source. If the widget isn't on the page, or the visitor arrives without that parameter (typed the URL directly, clicked an untracked link), the visit isn't attributed. Vaultd email links are tagged automatically when sent. For social media, add ?vaultd_src=instagram or ?vaultd_src=tiktok to every link you share — for example, your Instagram story link or TikTok bio URL.",
      },
      {
        question: "How is the conversion rate calculated?",
        answer:
          "Conversion rate = orders ÷ total visitors × 100. Visitors come from the traffic sources tracked during the drop (Instagram, email, TikTok, etc.). If no traffic source data was recorded, conversion rate will show 0% — this is normal for drops where the traffic tracking wasn't active.",
      },
      {
        question: "What is the deal rate vs interest rate?",
        answer:
          "Interest rate = how many visitors signed up for the waitlist (waitlist entries ÷ visitors). Deal rate = how many waitlist members actually bought something (buyers ÷ waitlist entries). Both together tell you where your funnel leaks: low interest rate means your landing page didn't convert visitors; low deal rate means people joined the waitlist but didn't follow through when the drop went live.",
      },
    ],
  },
  {
    key: "plans",
    label: "Plans & billing",
    questions: [
      {
        question: "What's the difference between the plans?",
        answer:
          "Each plan adds features and raises your drops/units quotas. Check the full breakdown on the Plans page, or in Help for what each feature actually does.",
      },
      {
        question: "How do I upgrade or downgrade my plan?",
        answer:
          "Go to Plans, find the plan you want, and click \"Switch to this plan\". Shopify will ask you to confirm the new subscription. All Vaultd plans are paid — there is no free tier.",
      },
      {
        question: "Will I be charged immediately when I upgrade?",
        answer:
          "Shopify handles all billing. When you confirm an upgrade, the charge starts from that date on a 30-day cycle. If you upgrade mid-cycle from a paid plan, Shopify prorates the difference automatically.",
      },
    ],
  },
  {
    key: "widgets",
    label: "Hype widgets",
    questions: [
      {
        question: "My widget isn't showing on the storefront",
        answer:
          "Widgets only appear when there is an active drop — either LIVE or DRAFT with a scheduled launch date. If no drop is in that state, the widget stays hidden automatically. Check that a drop is active in Vaultd, then reload your storefront.",
      },
      {
        question: "The progress bar design isn't showing",
        answer:
          "The Social proof widget's progress bar design requires the drop to have a waitlist size limit set. Without a capacity configured on the drop, there is no percentage to display and the widget stays hidden. Either set a max waitlist size on the drop, or switch to the Simple text or Avatar stack design instead.",
      },
      {
        question: "How do I add the widget to my product page?",
        answer:
          "In your Shopify admin, go to Online Store → Themes → Customize. In the Vaultd section (under Apps), drag the Hype Widget block onto your product page template and save. The widget will appear automatically when a drop is active for that product.",
      },
    ],
  },
  {
    key: "account",
    label: "Account & cancellation",
    questions: [
      {
        question: "How do I cancel my Vaultd subscription?",
        answer:
          "To cancel, go to Settings → Account in the Vaultd app and click \"Cancel subscription / Delete account\" — this opens your account portal at vaultd.pro. You can cancel your subscription there. You can also cancel directly from your Shopify admin: Apps → Manage apps → Vaultd → Cancel plan.",
      },
      {
        question: "How do I delete my Vaultd account?",
        answer:
          "Go to Settings → Account and click \"Cancel subscription / Delete account\" to open the account portal at vaultd.pro. From there, click \"Delete account\" and confirm. This permanently removes all your Vaultd data. Important: deleting your account does NOT cancel your Shopify subscription — you must cancel that separately from your Shopify admin to stop being charged.",
      },
      {
        question: "Will I receive a confirmation email when I delete my account?",
        answer:
          "Yes. A confirmation email is sent to the address on your Vaultd account when it is deleted. You also receive a welcome email when your account is first created.",
      },
      {
        question: "How do I reset my Vaultd account password?",
        answer:
          "Visit vaultd.pro/forgot-password, enter your account email, and we'll send you a 6-digit reset code. Enter the code and your new password to complete the reset. You can also use the \"Forgot password?\" link on the login page.",
      },
      {
        question: "My Shopify store and website account aren't synced — why?",
        answer:
          "Accounts sync automatically when the email on your Shopify store matches your Vaultd website account email. If they're different, the two accounts stay separate. You can link additional stores to one account from Settings → Account (Elite plan) using your Account ID.",
      },
    ],
  },
  {
    key: "appearance",
    label: "Appearance & multi-store",
    questions: [
      {
        question: "How do I change the app's accent color?",
        answer:
          "Settings → Appearance. Available colors depend on your plan — black is always available, higher plans unlock more.",
      },
      {
        question: "Can I link multiple Shopify stores to one account?",
        answer:
          "Yes, on the Elite plan. From Settings on your other store, use \"Log in\" with your Account ID and password.",
      },
      {
        question: "How do I find my Account ID?",
        answer:
          "Go to Settings → Account. Your Account ID is shown at the top of the Account section. It's a short alphanumeric code you'll need if you want to link another store to this account.",
      },
    ],
  },
];
