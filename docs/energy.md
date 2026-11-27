# Energy

**Energy** charts what the house and each appliance used, per day over the last
30 days and per month over the last 12. The worker snapshots every meter's
counter every 15 minutes and keeps about two years.

Once the home has a place (**Admin**, **Homes**), the worker stores each day's
outside temperature there from Open-Meteo: the last three months at once, then
yesterday every morning. The daily chart draws the average as a line and its
table gets a column, and the assistant reads them with the use to tell heating
from habits. Moving the home forgets them and starts over from the new place.
**Record past weather** in the home's menu on **Admin**, **Homes** fills the
last two years at once from Open-Meteo's archive, as far back as energy readings
go, so an instance that ran before this matches its old use too.

The house is the whole-house meter when there is one (the ZLinky reader or a
Linky online), the sum of the metered appliances otherwise. Appliances are the
metering plugs and Shelly meters.

## Linky

Two ways, use one:

- **Live, with hardware**: a LiXee ZLinky_TIC on the meter's TIC port, paired in
  Zigbee2MQTT. Live power, and the counter every few seconds.
- **Online, no hardware**: Enedis's daily use through
  [conso.boris.sh](https://conso.boris.sh/). Sign in there with your Enedis
  account, allow it, copy the token, then **Devices**, **Add a device**, **Linky
  online**, **Add the Linky** with the token and the 14-digit PRM (on your bill,
  or press + on the meter until it shows). The last year comes in at once, then
  a day behind: once yesterday is in it waits for the next day, otherwise it
  asks again every hour. Three days with nothing new from Enedis, or a refused
  token, puts the meter in error (admins get told after an hour) with the link
  to get a new token. **Check it now** on the device's edit sheet asks
  conso.boris.sh straight away. The token is stored encrypted. It works whoever
  sells you the electricity (Engie, EDF, TotalEnergies): Enedis runs every Linky
  and holds the readings, the supplier only bills them.
