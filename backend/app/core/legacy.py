"""Carrying data across the rename to formvis (1.50.5, the owner's rebrand). This file and frontend/src/io/legacy.ts are
the only places the app's former name remains: it is needed to find what was saved under it. The library folder moves
to its new name on the first start (when the new one does not exist yet and no custom folder is set); projects saved
with the former extensions are listed, opened, and replaced by .fmv when saved again; the former format identifier is
read. Nothing is lost and nothing is duplicated. To make a clean break, delete both files and their few call sites."""

from pathlib import Path

FORMER = "sonny"
#: Project extensions from before the rename, newest first.
PROJECT_EXTENSIONS = (".sny", f".{FORMER}")
#: The project format identifier written before the rename.
FORMAT = f"com.nodemode.{FORMER}"


def carry_over_library(new: Path) -> None:
    """Moves the library folder saved under the former name to `new`, when `new` does not exist yet."""
    old = new.with_name(FORMER.capitalize())
    if not new.exists() and old.is_dir():
        try:
            old.rename(new)
        except OSError:
            pass  # left where it is: the app starts with an empty library rather than failing
