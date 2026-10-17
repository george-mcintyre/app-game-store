import { describe, expect, it } from "vitest";
import { notesHtml } from "./notes.js";

describe("notesHtml", () => {
  it("makes paragraphs and bullet lists", () => {
    expect(notesHtml("What's Changed\n- Add rematch\n* Fix dealing\n\nSecond paragraph\nsame paragraph").html).toBe(
      "<p>What&#39;s Changed</p><ul><li>Add rematch</li><li>Fix dealing</li></ul><p>Second paragraph<br>same paragraph</p>",
    );
  });

  it("escapes html", () => {
    expect(notesHtml("<script>x</script>\n- <b>").html).toBe("<p>&lt;script&gt;x&lt;/script&gt;</p><ul><li>&lt;b&gt;</li></ul>");
  });

  it("returns nothing for blank input", () => {
    expect(notesHtml("  \n\n").html).toBe("");
  });
});
