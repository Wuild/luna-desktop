import {conditions} from '../dist/desktop/widgets/weather/model.js';
for (const [code, day, icon] of [[0,true,'clear'],[0,false,'clear-night'],[2,true,'few-clouds'],[2,false,'few-clouds-night'],[3,true,'overcast'],[45,true,'fog'],[51,true,'showers-scattered'],[61,true,'showers'],[71,true,'snow'],[95,true,'storm']]) {
    if (conditions(code,day)[1] !== `weather-${icon}-symbolic`) throw Error(`Wrong icon for ${code}, day=${day}`);
}
print('LUNA_DESKTOP_WEATHER_ICONS_PASS');
