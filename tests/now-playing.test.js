import {choosePlayer} from '../dist/desktop/widgets/now-playing/player.js';
function assert(value, message) { if (!value) throw Error(message); }
const firefox = {name: 'org.mpris.MediaPlayer2.firefox.instance1', Identity: 'Firefox', DesktopEntry: 'firefox', PlaybackStatus: 'Playing'};
const music = {name: 'org.mpris.MediaPlayer2.Music', Identity: 'Music', DesktopEntry: 'org.gnome.Music', PlaybackStatus: 'Paused'};
const players = [music, firefox];
assert(choosePlayer(players) === firefox, 'Playing apps have priority');
assert(players[0] === music, 'Selection does not mutate discovery order');
assert(choosePlayer(players, '', firefox.name, ' FIREFOX, discord ') === music, 'Exclusion overrides previous player');
assert(choosePlayer(players, 'firefox', '', 'firefox') === null, 'Exclusion overrides preference');
assert(choosePlayer(players, '', '', 'org.gnome.music; Firefox') === null, 'IDs and multiple exclusions');
assert(choosePlayer(players, '', '', ' , ; ') === firefox, 'Blank exclusions do not hide all apps');
print('NOW_PLAYING_PASS');
