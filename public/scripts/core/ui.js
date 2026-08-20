window.IPASS_UI = {
  esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  },
  formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
  },
  tag(status) {
    const map = {
      pending: ["●", "승인대기", "orange"],
      approved: ["✓", "승인", "green"],
      rejected: ["!", "반려", "red"],
      suspended: ["–", "사용중지", "gray"],
      drafting: ["●", "작성중", "gray"],
      draft: ["●", "작성중", "gray"],
      submitted: ["✓", "제출완료", "green"],
      evaluating: ["●", "검토중", "orange"],
      review: ["●", "검토중", "orange"],
      correction_required: ["!", "보완필요", "red"],
      supplement_required: ["!", "보완필요", "red"],
      revision_requested: ["!", "보완필요", "red"],
      finalized: ["✓", "최종완료", "blue"],
      completed: ["✓", "완료", "blue"]
    };
    const item = map[status] || ["", status || "-", "gray"];
    const marker = item[0] ? `<span aria-hidden="true">${item[0]}</span>` : "";
    return `<span class="tag ${item[2]}">${marker}${this.esc(item[1])}</span>`;
  }
};
