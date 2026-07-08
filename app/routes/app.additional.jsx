import {
  pagePopStyle,
  pageHeaderRowStyle,
  pageHeaderTitleRowStyle,
  pageHeaderTitleStyle,
  GridIcon,
  cardPadded,
  cardLabel,
} from "../styles/pop-ui";

export default function AdditionalPage() {
  return (
    <div style={pagePopStyle}>
      <div style={pageHeaderRowStyle}>
        <div style={pageHeaderTitleRowStyle}>
          <GridIcon />
          <h1 style={pageHeaderTitleStyle}>Additional page</h1>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{ ...cardPadded, flex: 1 }}>
          <div style={cardLabel}>MULTIPLE PAGES</div>
          <p style={{ fontSize: 13.5, color: "#303030", margin: "0 0 10px 0" }}>
            The app template comes with an additional page which demonstrates how
            to create multiple pages within app navigation using{" "}
            <a
              href="https://shopify.dev/docs/apps/tools/app-bridge"
              target="_blank"
              rel="noreferrer"
              style={{ color: "#1a1a1a", fontWeight: 600 }}
            >
              App Bridge
            </a>
            .
          </p>
          <p style={{ fontSize: 13.5, color: "#303030", margin: 0 }}>
            To create your own page and have it show up in the app navigation, add
            a page inside <code>app/routes</code>, and a link to it in the{" "}
            <code>&lt;ui-nav-menu&gt;</code> component found in{" "}
            <code>app/routes/app.jsx</code>.
          </p>
        </div>

        <div style={{ ...cardPadded, width: 260 }}>
          <div style={cardLabel}>RESOURCES</div>
          <a
            href="https://shopify.dev/docs/apps/design-guidelines/navigation#app-nav"
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 13.5, color: "#1a1a1a", fontWeight: 600, textDecoration: "none" }}
          >
            App nav best practices
          </a>
        </div>
      </div>
    </div>
  );
}
