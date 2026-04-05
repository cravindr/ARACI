import { useCallback, useEffect, useRef } from "react";

/**
 * Lightweight WYSIWYG for stored HTML (admin-only). Uses document.execCommand.
 * Remount with key when loading values from API so initial HTML is applied once.
 */
export default function RichTextConfigField({
  id,
  label,
  value,
  onChange,
  hint,
}) {
  const ref = useRef(null);

  // Seed once per mount; Configuration passes a new key after loading from API.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = value || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps -- value is initial HTML only; updates come from user input
  }, []);

  const sync = useCallback(() => {
    onChange(ref.current?.innerHTML ?? "");
  }, [onChange]);

  const exec = useCallback(
    (cmd) => {
      ref.current?.focus({ preventScroll: true });
      try {
        document.execCommand(cmd, false, null);
      } catch {
        /* ignore */
      }
      sync();
    },
    [sync]
  );

  const insertLink = useCallback(() => {
    const url = window.prompt("Link URL (https://…)", "https://");
    if (!url || !url.trim()) return;
    ref.current?.focus({ preventScroll: true });
    try {
      document.execCommand("createLink", false, url.trim());
    } catch {
      /* ignore */
    }
    sync();
  }, [sync]);

  return (
    <div className="field rich-text-field">
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <p className="rich-text-field__hint subtitle" style={{ marginTop: "0.25rem" }}>
          {hint}
        </p>
      ) : null}
      <div
        className="rich-toolbar"
        role="toolbar"
        aria-label={`${label} formatting`}
      >
        <button
          type="button"
          className="btn btn-ghost rich-toolbar__btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("bold")}
        >
          Bold
        </button>
        <button
          type="button"
          className="btn btn-ghost rich-toolbar__btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("italic")}
        >
          Italic
        </button>
        <button
          type="button"
          className="btn btn-ghost rich-toolbar__btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("underline")}
        >
          Underline
        </button>
        <span className="rich-toolbar__sep" aria-hidden="true" />
        <button
          type="button"
          className="btn btn-ghost rich-toolbar__btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("insertUnorderedList")}
        >
          Bullets
        </button>
        <button
          type="button"
          className="btn btn-ghost rich-toolbar__btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("insertOrderedList")}
        >
          Numbered
        </button>
        <span className="rich-toolbar__sep" aria-hidden="true" />
        <button
          type="button"
          className="btn btn-ghost rich-toolbar__btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={insertLink}
        >
          Link
        </button>
      </div>
      <div
        id={id}
        ref={ref}
        className="rich-editor-box"
        contentEditable
        suppressContentEditableWarning
        onInput={sync}
        onBlur={sync}
      />
    </div>
  );
}
