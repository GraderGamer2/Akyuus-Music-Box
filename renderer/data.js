'use strict';
// Genre families (first one is open by default)
const GENRE_GROUPS = [
  ['Popular', ['Metal', 'Rock', 'Jazz', 'Eurobeat', 'Trance', 'Orchestral', 'Piano', 'Vocal', 'Lo-fi', 'Electro Swing', 'Chiptune', 'Bossa Nova', 'Techno', 'Drum & Bass', 'Symphonic Metal']],
  ['Rock and metal', ['Rock', 'Metal', 'Heavy Metal', 'Power Metal', 'Symphonic Metal', 'Progressive Metal', 'Death Metal', 'Black Metal', 'Folk Metal', 'Metalcore', 'Hard Rock', 'Punk Rock', 'Pop Punk', 'Post-Rock', 'Shoegaze', 'Alternative Rock', 'Indie Rock', 'Math Rock']],
  ['Electronic and dance', ['Trance', 'Psytrance', 'Techno', 'House', 'Deep House', 'Progressive House', 'Eurobeat', 'Eurodance', 'Drum & Bass', 'Dubstep', 'Future Bass', 'Trap', 'Breakbeat', 'Hardcore', 'Hardstyle', 'Happy Hardcore', 'Gabber', 'Synthwave', 'Vaporwave', 'Future Funk', 'Glitch', 'IDM', 'Industrial', 'Electro', 'Chiptune']],
  ['Jazz, swing and soul', ['Jazz', 'Smooth Jazz', 'Jazz Fusion', 'Bebop', 'Latin Jazz', 'Big Band', 'Swing', 'Electro Swing', 'Blues', 'Funk', 'Soul', 'Disco', 'Ska']],
  ['Classical and orchestral', ['Orchestral', 'Classical', 'Baroque', 'Piano', 'String Quartet', 'Violin', 'Cello', 'Harp', 'Flute', 'Choir', 'Opera', 'Cinematic', 'Epic']],
  ['Folk and world', ['Folk', 'Acoustic', 'Celtic', 'Bluegrass', 'Country', 'Flamenco', 'Latin', 'Bossa Nova', 'Reggae', 'Tango', 'Waltz', 'Shamisen', 'Koto', 'Taiko', 'Music Box']],
  ['Pop and urban', ['Pop', 'J-Pop', 'City Pop', 'Idol', 'Hip Hop', 'Rap', 'R&B', 'Vocal', 'A Cappella', 'Ballad']],
  ['Chill and ambient', ['Ambient', 'Dark Ambient', 'Chillout', 'Downtempo', 'Trip Hop', 'New Age', 'Lo-fi', 'Relaxing', 'Meditation', 'Sleep']],
];

// Official main series, TH01 to TH20 (TH06 also has the 2026 "New Classic" remake)
const GAMES = [
  ['Touhou 1', 'Highly Responsive to Prayers', ['Reimu', 'Shingyoku', 'YuugenMagan', 'Elis', 'Sariel', 'Mima', 'Kikuri', 'Konngara']],
  ['Touhou 2', 'Story of Eastern Wonderland', ['Reimu', 'Marisa', 'Rika', 'Meira', 'Mima']],
  ['Touhou 3', 'Phantasmagoria of Dim. Dream', ['Reimu', 'Marisa', 'Mima', 'Chiyuri', 'Yumemi']],
  ['Touhou 4', 'Lotus Land Story', ['Reimu', 'Marisa', 'Yuuka']],
  ['Touhou 5', 'Mystic Square', ['Reimu', 'Marisa', 'Mima', 'Yuuka', 'Alice', 'Shinki', 'Sara', 'Louise', 'Yuki', 'Mai', 'Yumeko']],
  ['Touhou 6', 'Embodiment of Scarlet Devil', ['Reimu', 'Marisa', 'Rumia', 'Daiyousei', 'Cirno', 'Meiling', 'Koakuma', 'Patchouli', 'Sakuya', 'Remilia', 'Flandre']],
  ['Touhou 7', 'Perfect Cherry Blossom', ['Reimu', 'Marisa', 'Sakuya', 'Letty', 'Chen', 'Alice', 'Lily White', 'Lunasa', 'Merlin', 'Lyrica', 'Youmu', 'Yuyuko', 'Ran', 'Yukari']],
  ['Touhou 8', 'Imperishable Night', ['Reimu', 'Marisa', 'Sakuya', 'Youmu', 'Remilia', 'Yuyuko', 'Yukari', 'Alice', 'Wriggle', 'Mystia', 'Keine', 'Tewi', 'Reisen', 'Eirin', 'Kaguya', 'Mokou']],
  ['Touhou 9', 'Phantasmagoria of Flower View', ['Reimu', 'Marisa', 'Sakuya', 'Youmu', 'Reisen', 'Cirno', 'Lyrica', 'Mystia', 'Tewi', 'Aya', 'Medicine', 'Yuuka', 'Komachi', 'Eiki']],
  ['Touhou 10', 'Mountain of Faith', ['Reimu', 'Marisa', 'Sanae', 'Shizuha', 'Minoriko', 'Hina', 'Nitori', 'Momiji', 'Aya', 'Kanako', 'Suwako']],
  ['Touhou 11', 'Subterranean Animism', ['Reimu', 'Marisa', 'Yukari', 'Suika', 'Aya', 'Alice', 'Patchouli', 'Nitori', 'Kisume', 'Yamame', 'Parsee', 'Yuugi', 'Satori', 'Rin', 'Utsuho', 'Koishi']],
  ['Touhou 12', 'Undefined Fantastic Object', ['Reimu', 'Marisa', 'Sanae', 'Nazrin', 'Kogasa', 'Ichirin', 'Unzan', 'Minamitsu', 'Shou', 'Byakuren', 'Nue']],
  ['Touhou 13', 'Ten Desires', ['Reimu', 'Marisa', 'Sanae', 'Youmu', 'Kyouko', 'Yoshika', 'Seiga', 'Tojiko', 'Futo', 'Miko', 'Mamizou']],
  ['Touhou 14', 'Double Dealing Character', ['Reimu', 'Marisa', 'Sakuya', 'Wakasagihime', 'Sekibanki', 'Kagerou', 'Benben', 'Yatsuhashi', 'Seija', 'Shinmyoumaru', 'Raiko']],
  ['Touhou 15', 'Legacy of Lunatic Kingdom', ['Reimu', 'Marisa', 'Sanae', 'Reisen', 'Seiran', 'Ringo', 'Doremy', 'Sagume', 'Clownpiece', 'Junko', 'Hecatia']],
  ['Touhou 16', 'Hidden Star in Four Seasons', ['Reimu', 'Marisa', 'Aya', 'Cirno', 'Eternity Larva', 'Nemuno', 'Aunn', 'Narumi', 'Satono', 'Mai', 'Okina']],
  ['Touhou 17', 'Wily Beast and Weakest Creature', ['Reimu', 'Marisa', 'Youmu', 'Eika', 'Urumi', 'Kutaka', 'Yachie', 'Mayumi', 'Keiki', 'Saki']],
  ['Touhou 18', 'Unconnected Marketeers', ['Reimu', 'Marisa', 'Sakuya', 'Sanae', 'Mike', 'Takane', 'Sannyo', 'Misumaru', 'Tsukasa', 'Megumu', 'Chimata', 'Momoyo']],
  ['Touhou 19', 'Unfinished Dream of All Living Ghost', ['Reimu', 'Marisa', 'Sanae', 'Ran', 'Aunn', 'Nazrin', 'Seiran', 'Rin', 'Tsukasa', 'Mamizou', 'Yachie', 'Saki', 'Yuuma', 'Suika', 'Biten', 'Enoko', 'Chiyari', 'Hisami', 'Zanmu']],
  ['Touhou 20', 'Fossilized Wonders', ['Reimu', 'Marisa', 'Ubame', 'Chimi', 'Nareko', 'Yuiman', 'Toyohime', 'Ariya', 'Nina']],
];
const SONGS = ['Bad Apple!!', 'U.N. Owen Was Her?', 'Night of Nights', 'Necrofantasia', 'Septette for the Dead Princess', 'Lunatic Eyes', 'Native Faith', 'Hartmann\'s Youkai Girl', 'Flowering Night', 'Tomboyish Girl in Black', 'Cirno\'s Perfect Math Class', 'Marisa Stole the Precious Thing'];

// Search options. Options in the same exclusive group replace each other.
// [key, menu label, short label for the chip, exclusive group]
const OPTIONS = [
  ['newest', 'Newest uploads first', 'Newest first', ''],
  ['year', 'Uploaded in the past year', 'Past year', ''],
  ['gems', 'Hidden gems (under 50K views)', 'Hidden gems', 'pop'],
  ['popular', 'Popular (over 100K views)', 'Popular', 'pop'],
  ['vocal', 'With vocals', 'Vocal', 'voc'],
  ['instr', 'Instrumental', 'Instrumental', 'voc'],
  ['live', 'Live performances', 'Live', ''],
  ['short', 'Short songs (under 4 minutes)', 'Short', 'len'],
  ['long', 'Long songs (over 6 minutes)', 'Long', 'len'],
  ['japan', 'Japanese circles only', 'Japan only', ''],
  ['repeat', 'Include songs I already played', 'Repeats ok', ''],
];
