from selenium import webdriver
from selenium.common.exceptions import NoSuchElementException
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.keys import Keys
from PIL import Image

import sys
import ImageChops
import requests
import time
import json
import unittest
import os

def whoami():
    return sys._getframe(1).f_code.co_name

def readConfig():
    config_file = open('../../config.json')
    config = json.load(config_file)
    config_file.close()
    return config

def find(browser, selector):
    return browser.find_element_by_css_selector(selector)

def equal(im1, im2):
    return ImageChops.difference(im1, im2).getbbox() is None

def wait(browser):
    WebDriverWait(browser, 10).until(
        lambda driver : driver.find_element_by_id("selenium"))

def get_and_wait(browser, url):
    browser.get(url)
    wait(browser)

def testImage(browser, name):
    pathPass = './passing/%s.png' % name
    pathResult = './results/%s.png' % name
    # Let chromes scrollbar go away
    time.sleep(1)
    browser.save_screenshot(pathResult)
    if os.path.isfile(pathPass):
        passing = Image.open(pathPass)
        result = Image.open(pathResult)
        return equal(passing, result)
    return False

def emptyDir(folder):
    for f in os.listdir(folder):
        file_path = os.path.join(folder, f)
        if os.path.isfile(f):
            os.unlink(file_path)


class BasicTest(unittest.TestCase):

    @classmethod
    def setUpClass(cls):

        if not os.path.exists("./results"):
            os.makedirs("./results")

        emptyDir("./results")

        cls.conf = readConfig()
        cls.host = "http://%s:%s/" % (cls.conf['node']['host'],
                                      cls.conf['node']['port'])
        cls.browser = webdriver.Chrome()

        # Login
        get_and_wait(cls.browser, cls.host)
        find(cls.browser, "[name=username]").send_keys("test")
        find(cls.browser, "[name=password]").send_keys("test" + Keys.RETURN)
        wait(cls.browser)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        return None

    def setUp(self):
        get_and_wait(self.browser, self.host + "user/test/")
        find(self.browser, "[name=name]").send_keys("test" + Keys.RETURN)
        wait(self.browser)

    def tearDown(self):
        get_and_wait(self.browser, self.host + "user/test/")
        find(self.browser, "[value=delete]").click()
        wait(self.browser)

    def test_basic(self):
        get_and_wait(self.browser, self.host + "user/test/test/")
        find(self.browser, "#add-block").click()
        canvas = find(self.browser, "#canvas")
        ActionChains(self.browser)\
            .move_to_element_with_offset(canvas, 20, 20)\
            .click_and_hold(canvas)\
            .move_by_offset(100, 200)\
            .release(None)\
            .perform()

        find(self.browser, "#cursor").click()

        self.assertTrue(testImage(self.browser, whoami()))

    def test_basic2(self):
        get_and_wait(self.browser, self.host + "user/test/test/")
        find(self.browser, "#add-block").click()
        canvas = find(self.browser, "#canvas")
        ActionChains(self.browser)\
            .move_to_element_with_offset(canvas, 0, 0)\
            .click_and_hold(canvas)\
            .move_by_offset(100, 200)\
            .release(None)\
            .perform()

        find(self.browser, "#cursor").click()

        self.assertTrue(testImage(self.browser, whoami()))



if __name__ == '__main__':
    unittest.main()
