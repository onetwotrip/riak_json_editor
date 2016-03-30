#/bin/sh

python /home/iceg/GIT/test/kango/kango.py build ../riak_json_editor/

rm update.zip

cp certificates/chrome.pem output/chrome/key.pem

cd output/chrome/
zip -r ../update.zip .
cd -

rm output/chrome/key.pem