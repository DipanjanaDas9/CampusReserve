import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import "./StudentPages.css";

export function StudentPageHeader({ eyebrow, title, description, action, children }) {
  return (
    <header className="student-page-heading">
      <div className="student-page-heading-row">
        <div>
          <p className="student-page-eyebrow"><span />{eyebrow}</p>
          <h1>{title}</h1>
          <p className="student-page-description">{description}</p>
        </div>
        {action && <Link className="student-primary-action" to={action.to}>{action.label}<ArrowRight size={16} aria-hidden="true" /></Link>}
      </div>
      {children}
    </header>
  );
}
