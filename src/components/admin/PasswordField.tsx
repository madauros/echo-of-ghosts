import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

interface PasswordFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
}

/**
 * Password input with a show/hide toggle (eye icon), using the project's
 * floating-label `.field` / `.field-input` / `.field-label` CSS.
 * The label element is kept immediately after the input so the
 * `.field-input:focus + .field-label` sibling selector keeps working.
 */
export function PasswordField({ label, id, className, ...rest }: PasswordFieldProps) {
  const [shown, setShown] = useState(false);
  const inputId = id ?? rest.name ?? "password";

  return (
    <div className="field">
      <input
        id={inputId}
        type={shown ? "text" : "password"}
        dir="ltr"
        placeholder=" "
        className="field-input"
        style={{ paddingLeft: "3rem" }}
        {...rest}
      />
      <label htmlFor={inputId} className="field-label">
        {label}
      </label>
      <button
        type="button"
        tabIndex={-1}
        aria-label={shown ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
        onClick={() => setShown((v) => !v)}
        className="absolute left-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
      >
        {shown ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  );
}
