# libgen-dl

A fork of [libgen-downloader](https://github.com/obsfx/libgen-downloader) by
Ömercan Balandı (WTFPL, see `LICENSE`) that focuses on quality-of-life
improvements to the terminal app, as well as an Android APK port.

The list of mirrors is still fetched from the original project's
[configuration](https://github.com/obsfx/libgen-downloader/blob/configuration/config.v3.json)
branch. To find mirrors yourself, see https://open-slum.org/.

## Install

### Terminal

Linux and macOS:

``` curl -fsSL
https://raw.githubusercontent.com/Jaxx497/libgen-dl/master/install.sh | sh ```

Windows (PowerShell):

``` irm https://raw.githubusercontent.com/Jaxx497/libgen-dl/master/install.ps1
| iex ```

Both download the latest standalone executable (no Node needed) and set up
`lgd` as a short name too; run them again to update. There is no prebuilt
binary for Intel Macs: build from source. Or grab a binary yourself from the
[Releases](https://github.com/Jaxx497/libgen-dl/releases) page.

To build from source instead (needs [Node.js](https://nodejs.org) 20+):

``` git clone https://github.com/Jaxx497/libgen-dl cd libgen-dl npm install npm
run build npm install -g . libgen-dl ```

### Android

Download the APK from the
[Releases](https://github.com/Jaxx497/libgen-dl/releases) page and open it on
your phone (allow installing from your browser or file manager when asked).

Downloads are saved to the phone's Downloads folder; the ⚙ button picks a
different one. **Open** launches a finished file in a reader app. The ⤓ button
lists this session's downloads, with **Stop** for running and queued ones.

## Usage

``` libgen-dl                           interactive mode libgen-dl -s "The Art
of War"       start with a search libgen-dl -s "art of war" -e epub   only show
epub results ("-e all" for every type) libgen-dl -d <MD5> -o ~/books
download one file into ~/books libgen-dl -b <MD5LIST.txt>          download
every MD5 in a file (one per line) libgen-dl -u <MD5>                  print
the download URL libgen-dl -h                        help ```

`lgd` still works as a short alias for `libgen-dl`.

`-b` and `-d` exit with code 1 if any download failed.

### Keys

Results list:

| Key                              | Action
| | -------------------------------- |
----------------------------------------------------------------- | | `j` `k` /
`↓` `↑`                | move (a number first moves that many rows)
| | `g` `G`                          | first / last row
| | `Ctrl-d` `Ctrl-u`, `PgDn` `PgUp` | half page / page
| | `<n>` then `Enter` (or `<n>G`)   | jump to row n
| | `Enter` / `d`                    | download
| | `i` / `l` / `→`                  | details
| | `n` `p`                          | next / previous page (on a short
filtered page `n` looks further) | | `f`                              | filter
by filetype (`pdf,epub`; empty for all)                    | | `t`
| downloads panel                                                   | | `/` /
`Esc`                      | new search (previous query pre-filled)
| | `?`                              | help
| | `q` / `Ctrl-c`                   | quit (asks first while downloads are
running)                     |

Details view:

| Key               | Action              | | ----------------- |
------------------- | | `Enter` / `d`     | download            | | `h` / `←` /
`Esc` | back to the results | | `t`               | downloads panel     | | `q`
| quit                |

Downloads panel:

| Key               | Action                              | | -----------------
| ----------------------------------- | | `j` `k` / `↓` `↑` | move
| | `x`               | stop a download (running or queued) | | `r`
| retry a failed download             | | `c`               | clear finished
downloads            | | `t` / `h` / `Esc` | close
|

Existing files are never overwritten: a second copy is saved as `name(1).ext`.

### Config

`~/.config/libgen-dl/config.json` is created on first run (an existing
`~/.config/lgd` from before the rename is moved there) with every option
commented out. Lines starting with `//` are comments.

```jsonc { // default: current directory "downloadDir": "~/books", // default:
all filetypes "extensions": ["pdf", "epub"], // also available: language,
pages, publisher "columns": ["index", "ext", "title", "authors", "year",
"size"], // list books in this language first; default: mirror order
"language": "English", // tried first; see open-slum.org for mirrors "mirror":
"https://libgen.li", } ```

Command-line flags override the file.
