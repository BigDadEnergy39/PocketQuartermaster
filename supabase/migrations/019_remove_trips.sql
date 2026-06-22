-- Remove trip planning feature (consolidated into unit shopping list)
drop function if exists get_trips(uuid);
drop function if exists create_trip(uuid, text, date, date, integer, text);
drop function if exists update_trip(uuid, text, date, date, integer, text);
drop function if exists delete_trip(uuid);
drop function if exists get_trip_shopping_items(uuid);
drop function if exists add_trip_shopping_item(uuid, text, integer, uuid, text, text);
drop function if exists add_trip_shopping_item(uuid, text, integer, text, text, numeric);
drop function if exists update_trip_shopping_item(uuid, text, integer, text, numeric);
drop function if exists toggle_trip_item_purchased(uuid);
drop function if exists remove_trip_shopping_item(uuid);

drop table if exists shopping_items cascade;
drop table if exists trips cascade;
