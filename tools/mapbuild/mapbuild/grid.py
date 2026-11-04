"""British National Grid arithmetic, and the 20 m posts a pack is made of. Rows run north to south, columns west to east."""

import re
from dataclasses import dataclass

CELL = 20


def _letter_index(letter: str) -> int:
    index = ord(letter) - ord("A")
    return index - 1 if index > 7 else index  # the grid has no letter I


def parse_grid_ref(text: str) -> tuple[int, int]:
    """'SU 22 66' or 'SU 2200 6600' to easting and northing in metres."""
    match = re.fullmatch(r"\s*([A-HJ-Za-hj-z]{2})\s*(\d*)\s*(\d*)\s*", text)
    if not match:
        raise ValueError(f"not a grid reference: {text!r}")
    letters, first, second = match.group(1).upper(), match.group(2), match.group(3)
    digits = first + second
    if len(digits) % 2 or len(digits) > 10 or (second and len(first) != len(second)):
        raise ValueError(f"not a grid reference: {text!r}")
    half = len(digits) // 2
    a, b = _letter_index(letters[0]), _letter_index(letters[1])
    east = ((a - 2) % 5) * 5 + b % 5
    north = 19 - (a // 5) * 5 - b // 5
    if not (0 <= east <= 6 and 0 <= north <= 12):
        raise ValueError(f"outside Great Britain: {text!r}")
    scale = 10 ** (5 - half)
    return east * 100_000 + (int(digits[:half]) if half else 0) * scale, north * 100_000 + (int(digits[half:]) if half else 0) * scale


def square_letters(easting: int, northing: int) -> str:
    """The two letters of the 100 km square holding this point."""
    e, n = easting // 100_000, northing // 100_000
    a = (19 - n) // 5 * 5 + (e + 10) // 5
    b = (19 - n) * 5 % 25 + e % 5
    return "".join(chr(ord("A") + (i + 1 if i > 7 else i)) for i in (a, b))


@dataclass(frozen=True)
class Window:
    """A square of ground centred on a point: its posts are every 20 m, including both edges."""

    east: int
    north: int
    half: int

    @property
    def side(self) -> int:
        return 2 * self.half // CELL + 1

    @property
    def west(self) -> int:
        return self.east - self.half

    @property
    def south(self) -> int:
        return self.north - self.half

    @property
    def top(self) -> int:
        return self.north + self.half

    @property
    def right(self) -> int:
        return self.east + self.half

    def squares(self) -> list[str]:
        found = {square_letters(e, n) for e in range(self.west // 100_000 * 100_000, self.right, 100_000) for n in range(self.south // 100_000 * 100_000, self.top, 100_000)}
        return sorted(found)
